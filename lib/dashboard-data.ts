import { createServiceClient } from "@/lib/supabase/service";
import { todayIso, isoDaysAgo, diffDaysIso } from "@/lib/dates";
import { computeRecoveryScore, type RecoveryResult } from "@/lib/recovery-score";
import { normalizeWorkoutType, estimateKcal } from "@/lib/workout-types";
import { computeJournalImpact, type ImpactFactor } from "@/lib/journal-impact";
import { computeStrainScore, type StrainResult } from "@/lib/strain-score";
import {
  parseObjective,
  computeBaseTargets,
  computeAdjustedTargets,
  type Objective,
} from "@/lib/nutrition-calc";
import {
  DEFAULT_SLOTS,
  DEFAULT_PROFILES,
  detectDayProfile,
  computeSlotTargets,
  computeSlotStates,
  redistributeDelta,
  getCurrentSlotId,
  type SlotState,
  type MealSlot,
  type DayProfileId,
  type DayProfilesConfig,
} from "@/lib/meal-slots";
import type { Database } from "@/lib/types";

type DailyMetricsRow = Database["public"]["Tables"]["daily_metrics"]["Row"];
type WorkoutRow = Database["public"]["Tables"]["workouts"]["Row"];
type BodyCompositionRow = Database["public"]["Tables"]["body_composition"]["Row"];

export type DashboardSnapshot = {
  date: string;
  yesterday: string;
  today: DailyMetricsRow | null;
  yesterdayMetrics: DailyMetricsRow | null;
  hrvBaselineAvg: number | null;
  hrBaselineAvg: number | null;
  respiBaselineAvg: number | null;
  recovery: RecoveryResult;
  lastWorkout: WorkoutRow | null;
  recentWorkouts: WorkoutRow[];
  lastBodyComposition: BodyCompositionRow | null;
  prevBodyComposition: BodyCompositionRow | null;
  bodyCompositionAgeDays: number | null;
  proteinTotalToday: number;
  macrosToday: { calories: number; proteines_g: number; glucides_g: number; lipides_g: number };
  macrosTargets: { calories: number; proteines_g: number; glucides_g: number; lipides_g: number };
  calorieBalance7d: { date: string; ingested: number; burned: number; balance: number }[];
  tdee: number;
  adjustedTdee: number;
  adjustedTargets: { calories: number; glucides_g: number };
  estimatedRemainingKcal: number;
  sleepTargetMin: number;
  stepsTarget: number;
  weekWorkoutCount: number;
  weekAvgSteps: number | null;
  weekAvgSleep: number | null;
  plannedActivities: { type: string; count: number }[];
  journalImpact: ImpactFactor[];
  strain: StrainResult;
  activeSlot: SlotState | null;
  dayProfile: DayProfileId;
  objective: Objective;
  isTrainingDay: boolean;
  weightKg: number;
  hasJournalToday: boolean;
  latestBloodTest: {
    id: string;
    test_date: string;
    lab_name: string | null;
    biological_age: number | null;
    results: {
      biomarker_key: string;
      label: string;
      category: string;
      value: number;
      unit: string;
      ref_min: number | null;
      ref_max: number | null;
    }[];
  } | null;
  bloodTestAgeDays: number | null;
  lastSyncAt: string | null;
};

const DEFAULTS = {
  sleep_target_min: 450,
  steps_target: 10000,
  tdee_kcal: 2755,
  bmr_kcal: 1670,
};

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const supabase = createServiceClient();
  const date = todayIso();
  const yesterday = isoDaysAgo(1);
  const sevenDaysAgo = isoDaysAgo(7);
  const sixtyDaysAgo = isoDaysAgo(60);

  const [
    { data: recentMetrics },
    { data: workouts },
    { data: bodies },
    { data: proteinRows },
    { data: configRow },
    { data: protein7dRows },
    { data: mealRows },
    { data: plannedRows },
    { data: baselineMetrics },
    { data: journalRows },
    { data: bloodTests },
    { data: syncRows },
  ] = await Promise.all([
    supabase
      .from("daily_metrics")
      .select("*")
      .gte("date", sevenDaysAgo)
      .lte("date", date)
      .order("date", { ascending: false }),
    supabase
      .from("workouts")
      .select("*")
      .gte("started_at", `${sevenDaysAgo}T00:00:00`)
      .order("started_at", { ascending: false })
      .limit(20),
    supabase
      .from("body_composition")
      .select("*")

      .order("measured_at", { ascending: false })
      .limit(2),
    supabase.from("protein_logs").select("grams").eq("date", date),
    supabase.from("dashboard_config").select("*").eq("id", 1).single(),
    supabase
      .from("protein_logs")
      .select("id, date, grams, label, logged_at")
      .gte("date", sevenDaysAgo)
      .lte("date", date),
    supabase
      .from("meal_logs")
      .select("id, date, label, calories, proteines_g, glucides_g, lipides_g, logged_at")
      .gte("date", sevenDaysAgo)
      .lte("date", date),
    supabase
      .from("planned_activities")
      .select("type, count")
      .eq("date", date),
    supabase
      .from("daily_metrics")
      .select("date, hrv_ms, resting_hr_bpm, respiratory_rate, recovery_score, active_kcal")
      .gte("date", sixtyDaysAgo)
      .lt("date", date)
      .order("date", { ascending: false }),
    supabase
      .from("journal_entries")
      .select("date, mood, energy, stress")
      .gte("date", sixtyDaysAgo)
      .lte("date", date),
    supabase
      .from("blood_tests")
      .select("id, test_date, lab_name, biological_age, blood_test_results(biomarker_key, label, category, value, unit, ref_min, ref_max)")
      .order("test_date", { ascending: false })
      .limit(1) as unknown as { data: { id: string; test_date: string; lab_name: string | null; biological_age: number | null; blood_test_results: { biomarker_key: string; label: string; category: string; value: number; unit: string; ref_min: number | null; ref_max: number | null }[] }[] | null },
    supabase
      .from("sync_logs")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const config = (configRow ?? DEFAULTS) as Record<string, unknown>;

  const today = recentMetrics?.find((r) => r.date === date) ?? null;
  const yesterdayMetrics =
    recentMetrics?.find((r) => r.date === yesterday) ?? null;

  const past7 = (recentMetrics ?? []).filter((r) => r.date !== date);
  // Baseline 60j pour recovery (plus stable que 7j)
  const baseline60 = baselineMetrics ?? [];
  const hrv60dMed = med(baseline60.map((r) => r.hrv_ms));
  const hr60dAvg = avg(baseline60.map((r) => r.resting_hr_bpm));
  // HRV : médiane 60j (résiste aux pics), fallback 7j
  const hrvBaseline = hrv60dMed ?? med(past7.map((r) => r.hrv_ms));
  const hrBaseline = hr60dAvg ?? avg(past7.map((r) => r.resting_hr_bpm));
  const respiBaseline = avg(baseline60.map((r) => r.respiratory_rate)) ?? avg(past7.map((r) => r.respiratory_rate));

  const effectiveRestingHr = today?.resting_hr_bpm ?? yesterdayMetrics?.resting_hr_bpm ?? null;

  const recovery = computeRecoveryScore({
    hrvMs: today?.hrv_ms ?? null,
    hrv7dAvgMs: hrvBaseline,
    restingHrBpm: effectiveRestingHr,
    restingHr7dAvgBpm: hrBaseline,
    sleepTotalMin: today?.sleep_total_min ?? null,
    sleepRemPct: today?.sleep_rem_pct ?? null,
    sleepDeepPct: today?.sleep_deep_pct ?? null,
    respiratoryRate: today?.respiratory_rate ?? null,
    respiratoryRate7dAvg: respiBaseline,
  });

  const recentWorkouts = workouts ?? [];
  const lastWorkout = recentWorkouts[0] ?? null;

  const lastBodyComposition = bodies?.[0] ?? null;
  const prevBodyComposition = bodies?.[1] ?? null;
  const bodyCompositionAgeDays = lastBodyComposition
    ? diffDaysIso(date, lastBodyComposition.measured_at)
    : null;

  const proteinTotalToday = (proteinRows ?? []).reduce(
    (sum, r) => sum + r.grams,
    0,
  );

  const allMeals = mealRows ?? [];
  const macrosToday = allMeals
    .filter((r) => r.date === date)
    .reduce(
      (acc, r) => ({
        calories: acc.calories + (r.calories ?? 0),
        proteines_g: acc.proteines_g + (r.proteines_g ?? 0),
        glucides_g: acc.glucides_g + (r.glucides_g ?? 0),
        lipides_g: acc.lipides_g + (r.lipides_g ?? 0),
      }),
      { calories: 0, proteines_g: 0, glucides_g: 0, lipides_g: 0 },
    );

  const tdee = (config.tdee_kcal as number | null) ?? DEFAULTS.tdee_kcal;
  const bmr = (config.bmr_kcal as number | null) ?? DEFAULTS.bmr_kcal;
  const weightKg = (lastBodyComposition?.weight_kg ?? 70) as number;
  const objective = parseObjective(config.user_objective as string | null);

  const mealCalByDay = new Map<string, number>();
  for (const r of allMeals) {
    mealCalByDay.set(r.date, (mealCalByDay.get(r.date) ?? 0) + (r.calories ?? 0));
  }
  const calorieBalance7d = (recentMetrics ?? [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((m) => mealCalByDay.has(m.date))
    .map((m) => {
      const ingested = mealCalByDay.get(m.date)!;
      const burned = bmr + (m.active_kcal ?? 0);
      return { date: m.date, ingested, burned, balance: ingested - burned };
    });

  // Détection jour training / repos
  const todayWorkouts = recentWorkouts.filter((w) => w.started_at.startsWith(date));
  const plannedList = plannedRows ?? [];
  const isTrainingDay = todayWorkouts.length > 0 || plannedList.length > 0;

  // Macros de base selon objectif + type de jour
  const macrosTargets = computeBaseTargets({ objective, tdee, weightKg, isTrainingDay });

  // Workouts restants estimés
  const doneCountByType = new Map<string, number>();
  for (const w of todayWorkouts) {
    const normalized = normalizeWorkoutType(w.type ?? "");
    doneCountByType.set(normalized, (doneCountByType.get(normalized) ?? 0) + 1);
  }

  let estimatedRemainingKcal = 0;
  for (const p of plannedList) {
    const done = doneCountByType.get(p.type.toLowerCase()) ?? 0;
    const remaining = Math.max(0, p.count - done);
    estimatedRemainingKcal += estimateKcal(p.type, remaining);
  }

  // Ajustement temps réel
  const activeKcalToday = today?.active_kcal ?? 0;
  const adjusted = computeAdjustedTargets({
    baseTargets: macrosTargets,
    objective,
    bmr,
    tdee,
    activeKcalToday,
    estimatedRemainingKcal,
    isTrainingDay,
  });

  const adjustedTdee = adjusted.adjustedTdee;
  const adjustedTargets = {
    calories: adjusted.calories,
    glucides_g: adjusted.glucides_g,
  };

  const weekWorkoutCount = recentWorkouts.length;
  const weekSteps = past7.map((r) => r.steps).filter((v): v is number => v != null);
  const weekAvgSteps = weekSteps.length > 0 ? Math.round(weekSteps.reduce((a, b) => a + b, 0) / weekSteps.length) : null;
  const weekSleep = past7.map((r) => r.sleep_total_min).filter((v): v is number => v != null);
  const weekAvgSleep = weekSleep.length > 0 ? Math.round(weekSleep.reduce((a, b) => a + b, 0) / weekSleep.length) : null;

  // Impact analysis : corrélation journal → recovery J+1 (60j de données)
  const allMetricsForImpact = [
    ...(recentMetrics ?? []).map((r) => ({ date: r.date, recovery_score: r.recovery_score })),
    ...(baselineMetrics ?? []).map((r) => ({ date: r.date, recovery_score: r.recovery_score })),
  ];
  const journalImpact = computeJournalImpact(journalRows ?? [], allMetricsForImpact);

  // Strain score : charge du jour vs baseline 30j
  const thirtyDaysAgoDate = isoDaysAgo(30);
  const strainBaseline = baseline60
    .filter((r) => r.date >= thirtyDaysAgoDate)
    .map((r) => r.active_kcal ?? 0);
  const strain = computeStrainScore(activeKcalToday, strainBaseline);

  // ─── Slot actif du jour ──────────────────────────────────────
  const slotsConfig = (config as Record<string, unknown>).meal_slots_config as MealSlot[] | null ?? DEFAULT_SLOTS;
  const profilesConfig = (config as Record<string, unknown>).day_profiles_config as DayProfilesConfig | null ?? DEFAULT_PROFILES;
  const workoutsWithType = todayWorkouts.filter((w): w is WorkoutRow & { type: string } => w.type != null);
  const dayProfile = detectDayProfile(workoutsWithType, plannedList);

  const effectiveTargetsForSlots = {
    calories: adjustedTargets.calories,
    proteines_g: macrosTargets.proteines_g,
    glucides_g: adjustedTargets.glucides_g,
    lipides_g: macrosTargets.lipides_g,
  };
  const slotTargetsMap = computeSlotTargets(profilesConfig[dayProfile], effectiveTargetsForSlots, slotsConfig);

  const nowParis = new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Paris" });
  const currentHour = parseInt(nowParis, 10);

  const todayMeals = allMeals.filter((m) => m.date === date).map((m) => ({
    id: m.id,
    label: m.label ?? null,
    calories: m.calories ?? 0,
    proteines_g: m.proteines_g ?? 0,
    glucides_g: m.glucides_g ?? 0,
    lipides_g: m.lipides_g ?? 0,
    logged_at: m.logged_at,
  }));
  const todayProteins = (protein7dRows ?? []).filter((p) => p.date === date).map((p) => ({
    id: p.id,
    grams: p.grams,
    label: p.label ?? null,
    logged_at: p.logged_at,
  }));

  const rawSlotStates = computeSlotStates(todayMeals, todayProteins, slotsConfig, slotTargetsMap, currentHour);
  const slotStates = redistributeDelta(rawSlotStates);
  const activeSlotId = getCurrentSlotId(slotsConfig, currentHour);
  const activeSlot = activeSlotId ? slotStates.find((s) => s.slot.id === activeSlotId) ?? null : null;

  return {
    date,
    yesterday,
    today,
    yesterdayMetrics,
    hrvBaselineAvg: hrvBaseline,
    hrBaselineAvg: hrBaseline,
    respiBaselineAvg: respiBaseline,
    recovery,
    lastWorkout,
    recentWorkouts,
    lastBodyComposition,
    prevBodyComposition,
    bodyCompositionAgeDays,
    proteinTotalToday,
    macrosToday,
    macrosTargets,
    calorieBalance7d,
    tdee,
    adjustedTdee,
    adjustedTargets,
    estimatedRemainingKcal,
    plannedActivities: (plannedRows ?? []).map((r) => ({ type: r.type, count: r.count })),
    journalImpact,
    strain,
    sleepTargetMin: (config.sleep_target_min as number | null) ?? DEFAULTS.sleep_target_min,
    stepsTarget: (config.steps_target as number | null) ?? DEFAULTS.steps_target,
    weekWorkoutCount,
    weekAvgSteps,
    weekAvgSleep,
    activeSlot,
    dayProfile,
    objective,
    isTrainingDay,
    weightKg,
    hasJournalToday: (journalRows ?? []).some((j) => j.date === date),
    latestBloodTest: bloodTests?.[0]
      ? {
          id: bloodTests[0].id,
          test_date: bloodTests[0].test_date,
          lab_name: bloodTests[0].lab_name,
          biological_age: bloodTests[0].biological_age,
          results: bloodTests[0].blood_test_results ?? [],
        }
      : null,
    bloodTestAgeDays: bloodTests?.[0]
      ? diffDaysIso(bloodTests[0].test_date, date)
      : null,
    lastSyncAt: syncRows?.[0]?.created_at ?? null,
  };
}

function avg(values: (number | null)[]): number | null {
  const filtered = values.filter((v): v is number => v != null);
  if (filtered.length === 0) return null;
  return filtered.reduce((a, b) => a + b, 0) / filtered.length;
}

function med(values: (number | null)[]): number | null {
  const sorted = values.filter((v): v is number => v != null).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
