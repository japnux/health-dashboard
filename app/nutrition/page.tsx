import { createServiceClient } from "@/lib/supabase/service";
import { todayIso, isoDaysAgo, formatFrLong } from "@/lib/dates";
import { normalizeWorkoutType, estimateKcal } from "@/lib/workout-types";
import { parseObjective, computeBaseTargets, computeAdjustedTargets } from "@/lib/nutrition-calc";
import {
  DEFAULT_SLOTS,
  DEFAULT_PROFILES,
  detectDayProfile,
  computeSlotTargets,
  computeSlotStates,
  redistributeDelta,
  type MealSlot,
  type DayProfilesConfig,
} from "@/lib/meal-slots";
import { NutritionPageTracker } from "@/components/NutritionPageTracker";
import { NutritionLogList } from "@/components/NutritionLogList";

export const dynamic = "force-dynamic";

export default async function NutritionPage() {
  const supabase = createServiceClient();
  const date = todayIso();
  const sevenDaysAgo = isoDaysAgo(7);

  const [{ data: mealLogs }, { data: proteinLogs }, { data: configRow }, { data: mealLogs7d }, { data: metrics7d }, { data: plannedRows }, { data: todayWorkouts }, { data: proteinLogs7d }, { data: workouts7d }, { data: bodyRows }] =
    await Promise.all([
      supabase
        .from("meal_logs")
        .select("id, date, label, source, calories, proteines_g, glucides_g, lipides_g, logged_at")
        .eq("date", date)
        .order("logged_at", { ascending: false }),
      supabase
        .from("protein_logs")
        .select("id, date, grams, source, label, logged_at")
        .eq("date", date)
        .order("logged_at", { ascending: false }),
      supabase
        .from("dashboard_config")
        .select("tdee_kcal, bmr_kcal, user_objective, meal_slots_config, day_profiles_config")
        .eq("id", 1)
        .single(),
      supabase
        .from("meal_logs")
        .select("date, proteines_g")
        .gte("date", sevenDaysAgo)
        .lte("date", date),
      supabase
        .from("daily_metrics")
        .select("date, active_kcal")
        .gte("date", sevenDaysAgo)
        .lte("date", date)
        .order("date", { ascending: true }),
      supabase
        .from("planned_activities")
        .select("type, count")
        .eq("date", date),
      supabase
        .from("workouts")
        .select("type")
        .gte("started_at", `${date}T00:00:00`)
        .lte("started_at", `${date}T23:59:59`),
      supabase
        .from("protein_logs")
        .select("date, grams")
        .gte("date", sevenDaysAgo)
        .lte("date", date),
      supabase
        .from("workouts")
        .select("started_at, type")
        .gte("started_at", `${sevenDaysAgo}T00:00:00`)
        .lte("started_at", `${date}T23:59:59`),
      supabase
        .from("body_composition")
        .select("weight_kg")
        .order("measured_at", { ascending: false })
        .limit(1),
    ]);

  const meals = mealLogs ?? [];
  const proteins = proteinLogs ?? [];

  const macrosFromMeals = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      proteines_g: acc.proteines_g + m.proteines_g,
      glucides_g: acc.glucides_g + m.glucides_g,
      lipides_g: acc.lipides_g + m.lipides_g,
    }),
    { calories: 0, proteines_g: 0, glucides_g: 0, lipides_g: 0 },
  );

  const proteinFromLogs = proteins.reduce((s, r) => s + r.grams, 0);

  const tdee = configRow?.tdee_kcal ?? 2755;
  const bmr = configRow?.bmr_kcal ?? 1670;
  const weightKg = (bodyRows?.[0]?.weight_kg ?? 70) as number;
  const objective = parseObjective(configRow?.user_objective as string | null);

  // Détection jour training / repos
  const isTrainingDay = (todayWorkouts ?? []).length > 0 || (plannedRows ?? []).length > 0;

  // Macros de base selon objectif + type de jour
  const targets = computeBaseTargets({ objective, tdee, weightKg, isTrainingDay });
  const proteinTarget = targets.proteines_g;

  // Workouts restants estimés
  const doneCountByType = new Map<string, number>();
  for (const w of todayWorkouts ?? []) {
    const normalized = normalizeWorkoutType(w.type ?? "");
    doneCountByType.set(normalized, (doneCountByType.get(normalized) ?? 0) + 1);
  }
  let estimatedRemainingKcal = 0;
  for (const p of plannedRows ?? []) {
    const done = doneCountByType.get(p.type.toLowerCase()) ?? 0;
    const remaining = Math.max(0, p.count - done);
    estimatedRemainingKcal += estimateKcal(p.type, remaining);
  }

  // Ajustement temps réel
  const todayMetrics = (metrics7d ?? []).find((m) => m.date === date);
  const activeKcalToday = todayMetrics?.active_kcal ?? 0;
  const adjusted = computeAdjustedTargets({
    baseTargets: targets,
    objective,
    bmr,
    tdee,
    activeKcalToday,
    estimatedRemainingKcal,
    isTrainingDay,
  });
  const adjustedTargets = { calories: adjusted.calories, glucides_g: adjusted.glucides_g };

  // ─── Meal Slots ─────────────────────────────────────────────────
  const slotsConfig = (configRow?.meal_slots_config as MealSlot[] | null) ?? DEFAULT_SLOTS;
  const profilesConfig = (configRow?.day_profiles_config as DayProfilesConfig | null) ?? DEFAULT_PROFILES;
  const workoutsWithType = (todayWorkouts ?? []).filter((w): w is { type: string } => w.type != null);
  const dayProfile = detectDayProfile(workoutsWithType, plannedRows ?? []);
  const currentProfile = profilesConfig[dayProfile];

  // Targets effectifs du jour (ajustés aux workouts)
  const effectiveTargets = {
    calories: adjustedTargets.calories,
    proteines_g: targets.proteines_g,
    glucides_g: adjustedTargets.glucides_g,
    lipides_g: targets.lipides_g,
  };

  const slotTargetsMap = computeSlotTargets(currentProfile, effectiveTargets, slotsConfig);

  // Heure courante Europe/Paris
  const nowParis = new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Paris" });
  const currentHour = parseInt(nowParis, 10);

  // Préparer les logs pour le slot engine
  const slotMeals = meals.map((m) => ({
    id: m.id,
    label: m.label,
    calories: m.calories,
    proteines_g: m.proteines_g,
    glucides_g: m.glucides_g,
    lipides_g: m.lipides_g,
    logged_at: m.logged_at,
  }));
  const slotProteinLogs = proteins.map((p) => ({
    id: p.id,
    grams: p.grams,
    label: p.label,
    logged_at: p.logged_at,
  }));

  const rawSlotStates = computeSlotStates(slotMeals, slotProteinLogs, slotsConfig, slotTargetsMap, currentHour);
  const slotStates = redistributeDelta(rawSlotStates);

  const mealProtByDay = new Map<string, number>();
  for (const r of mealLogs7d ?? []) {
    mealProtByDay.set(r.date, (mealProtByDay.get(r.date) ?? 0) + (r.proteines_g ?? 0));
  }
  for (const r of proteinLogs7d ?? []) {
    mealProtByDay.set(r.date, (mealProtByDay.get(r.date) ?? 0) + (r.grams ?? 0));
  }

  // ─── Protein Attainment 7j ──────────────────────────────────────────
  // Grouper workouts par jour pour détecter le profil de chaque jour
  const workoutsByDay = new Map<string, { type: string }[]>();
  for (const w of workouts7d ?? []) {
    if (!w.type) continue;
    const wDate = w.started_at.slice(0, 10);
    const arr = workoutsByDay.get(wDate) ?? [];
    arr.push({ type: w.type });
    workoutsByDay.set(wDate, arr);
  }

  // Générer les 7 jours (y compris ceux sans données)
  const allDates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    allDates.push(d.toISOString().slice(0, 10));
  }

  const proteinAttainment7d = allDates
    .filter((d) => mealProtByDay.has(d) || d === date) // exclure jours sans aucune donnée sauf aujourd'hui
    .map((d) => {
      const dayWorkouts = workoutsByDay.get(d) ?? [];
      const profile = detectDayProfile(dayWorkouts, d === date ? (plannedRows ?? []) : []);
      // Types normalisés des workouts du jour pour les icônes
      const workoutTypes = dayWorkouts.map((w) => normalizeWorkoutType(w.type));
      return {
        date: d,
        protein: Math.round(mealProtByDay.get(d) ?? 0),
        target: proteinTarget,
        dayProfile: profile,
        workoutTypes,
        isToday: d === date,
      };
    });

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6 space-y-4">
      <header className="pt-3 pb-1">
        <p className="text-xs uppercase tracking-wide text-[var(--color-body)] font-normal">
          Suivi nutrition
        </p>
        <h1
          className="text-2xl sm:text-[2rem] font-light tracking-tight text-[var(--color-heading)] dark:text-white capitalize"
          style={{ letterSpacing: "-0.64px" }}
        >
          {formatFrLong(date)}
        </h1>
      </header>

      <NutritionPageTracker
        date={date}
        macros={macrosFromMeals}
        targets={targets}
        proteinFromLogs={proteinFromLogs}
        proteinAttainment7d={proteinAttainment7d}
        tdee={tdee}
        bmr={bmr}
        activeKcalToday={activeKcalToday}
        adjustedTargets={adjustedTargets}
        estimatedRemainingKcal={estimatedRemainingKcal}
        slotStates={slotStates}
        dayProfile={dayProfile}
        slots={slotsConfig}
        objective={objective}
        isTrainingDay={isTrainingDay}
        weightKg={weightKg}
      />

      <NutritionLogList meals={meals} proteinLogs={proteins} />
    </main>
  );
}
