import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { logApiUsage } from "@/lib/api-usage";
import { todayIso, isoDaysAgo } from "@/lib/dates";
import { getUserProfile, profileToPromptBlock } from "@/lib/user-profile";
import { normalizeWorkoutType, estimateKcal } from "@/lib/workout-types";
import { computeStrainScore } from "@/lib/strain-score";
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

async function isAuthenticated(): Promise<boolean> {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return false;
  const expected = createHash("sha256")
    .update(pw + "-hd-session")
    .digest("hex");
  const cookieStore = await cookies();
  return cookieStore.get("hd_session")?.value === expected;
}

export type AiTrend = {
  title: string;
  emoji: string;
  category: "sommeil" | "récupération" | "activité" | "nutrition";
  bullets: string[];
  comparison: string | null;
  confidence: "haute" | "moyenne" | "basse";
  type: "info" | "warning" | "positive";
};

export type AiWorkoutReco = {
  type: string;
  intensity: string;
  duration: string;
  reason: string;
  factors: string[];
};

export type AiRecommendation = {
  emoji: string;
  text: string;
  priority: "P1" | "P2" | "P3";
  category: "sommeil" | "récupération" | "activité" | "nutrition" | "général";
};

export type AiInsightsContent = {
  trends: AiTrend[];
  recommendations: AiRecommendation[];
  workoutSuggestion: AiWorkoutReco;
  generatedAt: string;
};

const SYSTEM_PROMPT = `Tu es un coach santé et performance. Brief concis basé sur les données.

INTERDICTIONS ABSOLUES (violation = réponse rejetée) :
1. JAMAIS écrire "jour off", "journée off", "repos planifié", "jour de repos" dans AUCUN champ si hasPlannedActivities=false. L'utilisateur n'a pas planifié ≠ jour off.
2. JAMAIS écrire "après jour off" ou "après repos" si un workout existe la veille (course, natation, surf = vrais entraînements).
3. JAMAIS inventer un objectif. Le champ "objective" des données est la vérité. Si objective="recomposition", écris "recomposition", pas "lean bulk" ni autre chose.
4. JAMAIS écrire "sous objectif" sans vérifier : compare valeur RÉELLE vs target FOURNI. Ex: 495min de sommeil > 450min target = AU-DESSUS.
5. Reco sur un repas/aliment/macros → category "nutrition", JAMAIS "sommeil".
6. Nombre de séances : TOUJOURS utiliser workoutsByDayAndType (pré-calculé, source de vérité). NE JAMAIS compter soi-même depuis le tableau workouts. NE PAS confondre plannedActivities.count (=objectif) avec les séances réelles.

FORMAT :
1. TENDANCES (exactement 3) : observations sur données MESURÉES (sommeil, HRV, strain, nutrition). Pas de tendance sur le planning.
   { title (max 4 mots), emoji, category: "sommeil"|"récupération"|"activité"|"nutrition", bullets (2 max, 10 mots max), comparison: "↑ vs moy 7j"|null, confidence: "haute"(5j+)|"moyenne"(3-4j)|"basse", type: "positive"|"warning"|"info" }

2. RECOMMANDATIONS (exactement 3) : 1 phrase max 15 mots, priorité P1/P2/P3.
   { emoji, text, priority, category: "sommeil"|"récupération"|"activité"|"nutrition"|"général" }

3. SUGGESTION WORKOUT : basée sur recovery, HRV, strain, sommeil.
   - type : nom normalisé (Surf, Musculation, Yoga, Course, Natation, Repos)
   - duration : avec unité (ex: "45 min")
   - reason : 1 phrase, basée sur biométrie uniquement
   - factors : observations factuelles depuis les données
   Si hasPlannedActivities=true ET remainingPlanned vide → tout est fait → suggère Repos/Mobilité.
   Si strain ≥ 6 ET tout est fait → repos/récupération active obligatoire.

RÈGLES :
- Sommeil en XhYY (pas en minutes). HRV en ms, FC en bpm, poids en kg.
- Valeurs concrètes, pas de généralités.
- Ne pas répéter dans les recos ce qui est dans les tendances.
- Workout suggestion et tendances doivent être cohérentes entre elles.
- Sauna = récupération (pas un entraînement intense), effet positif sur recovery.
- Meal slots : utilise mealSlots, remainingMacros et dayProfile pour des recos nutrition concrètes (quel slot, quoi manger, combien de P/G/L).
- Respi élevée ou SpO2 < 95% → baisser intensité workout, signaler en tendance recovery.

JSON uniquement, sans markdown :
{
  "trends": [{ "title": "", "emoji": "", "category": "", "bullets": [], "comparison": null, "confidence": "", "type": "" }],
  "recommendations": [{ "emoji": "", "text": "", "priority": "", "category": "" }],
  "workoutSuggestion": { "type": "", "intensity": "", "duration": "", "reason": "", "factors": [] }
}`;

async function getLatestDataVersion(supabase: ReturnType<typeof createServiceClient>) {
  const [{ data: syncData }, { data: mealData }, { data: plannedData }] = await Promise.all([
    supabase
      .from("sync_logs")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("meal_logs")
      .select("logged_at")
      .order("logged_at", { ascending: false })
      .limit(1),
    supabase
      .from("planned_activities")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const timestamps = [
    syncData?.[0]?.created_at,
    mealData?.[0]?.logged_at,
    plannedData?.[0]?.created_at,
  ].filter((t): t is string => t != null);
  if (timestamps.length === 0) return null;
  return timestamps.sort().pop()!;
}

async function getCachedInsights(supabase: ReturnType<typeof createServiceClient>) {
  const { data } = await supabase
    .from("ai_cache")
    .select("*")
    .eq("type", "daily_insights")
    .single();
  return data;
}

async function fetchContextData(supabase: ReturnType<typeof createServiceClient>) {
  const today = todayIso();
  const sevenDaysAgo = isoDaysAgo(7);
  const thirtyDaysAgo = isoDaysAgo(30);

  const [metricsRes, workoutsRes, bodyRes, proteinRes, journalRes, mealRes, plannedRes, configRes] =
    await Promise.all([
      supabase
        .from("daily_metrics")
        .select("date, hrv_ms, resting_hr_bpm, respiratory_rate, spo2_pct, sleep_total_min, sleep_rem_pct, sleep_deep_pct, steps, active_kcal, daylight_min, recovery_score")
        .gte("date", sevenDaysAgo)
        .lte("date", today)
        .order("date", { ascending: true }),
      supabase
        .from("workouts")
        .select("started_at, type, duration_min, kcal")
        .gte("started_at", `${sevenDaysAgo}T00:00:00`)
        .order("started_at", { ascending: true }),
      supabase
        .from("body_composition")
        .select("measured_at, weight_kg, body_fat_pct, lean_mass_kg")

        .order("measured_at", { ascending: false })
        .limit(3),
      supabase
        .from("protein_logs")
        .select("id, date, grams, label, logged_at")
        .gte("date", sevenDaysAgo)
        .lte("date", today),
      supabase
        .from("journal_entries")
        .select("date, mood, energy, stress")
        .gte("date", thirtyDaysAgo)
        .lte("date", today)
        .order("date", { ascending: true }),
      supabase
        .from("meal_logs")
        .select("id, date, label, calories, proteines_g, glucides_g, lipides_g, logged_at")
        .gte("date", sevenDaysAgo)
        .lte("date", today),
      supabase
        .from("planned_activities")
        .select("type, count")
        .eq("date", today),
      supabase
        .from("dashboard_config")
        .select("*")
        .eq("id", 1)
        .single(),
    ]);

  const nutritionByDay = new Map<string, { calories: number; proteines_g: number; glucides_g: number; lipides_g: number }>();
  for (const row of mealRes.data ?? []) {
    const prev = nutritionByDay.get(row.date) ?? { calories: 0, proteines_g: 0, glucides_g: 0, lipides_g: 0 };
    nutritionByDay.set(row.date, {
      calories: prev.calories + row.calories,
      proteines_g: prev.proteines_g + row.proteines_g,
      glucides_g: prev.glucides_g + row.glucides_g,
      lipides_g: prev.lipides_g + row.lipides_g,
    });
  }

  for (const row of proteinRes.data ?? []) {
    const prev = nutritionByDay.get(row.date) ?? { calories: 0, proteines_g: 0, glucides_g: 0, lipides_g: 0 };
    nutritionByDay.set(row.date, {
      ...prev,
      proteines_g: prev.proteines_g + row.grams,
    });
  }

  // Croiser workouts faits aujourd'hui avec activités prévues
  const todayWorkouts = (workoutsRes.data ?? []).filter(
    (w) => w.started_at.startsWith(today),
  );
  const planned = plannedRes.data ?? [];

  // Compter les workouts faits par type (normaliser via mapping partagé)
  const doneCountByType = new Map<string, number>();
  for (const w of todayWorkouts) {
    const normalized = normalizeWorkoutType(w.type ?? "");
    doneCountByType.set(normalized, (doneCountByType.get(normalized) ?? 0) + 1);
  }

  // Calculer sessions restantes
  const completedToday: { type: string; count: number }[] = [];
  const remainingPlanned: { type: string; count: number }[] = [];
  for (const p of planned) {
    const done = doneCountByType.get(p.type.toLowerCase()) ?? 0;
    if (done > 0) {
      completedToday.push({ type: p.type, count: Math.min(done, p.count) });
    }
    const remaining = p.count - done;
    if (remaining > 0) {
      remainingPlanned.push({ type: p.type, count: remaining });
    }
  }

  // Config et objectifs
  const config = (configRes.data ?? {}) as Record<string, number | string | null>;
  const sleepTarget = (config.sleep_target_min ?? 450) as number;
  const stepsTarget = (config.steps_target ?? 10000) as number;
  const bmr = (config.bmr_kcal ?? 1670) as number;
  const tdee = (config.tdee_kcal ?? 2755) as number;
  const latestBody = (bodyRes.data ?? [])[0];
  const weightKg = (latestBody?.weight_kg ?? 70) as number;
  const objective = parseObjective(config.user_objective as string | null);
  const isTrainingDay = todayWorkouts.length > 0 || planned.length > 0;

  const baseTargets = computeBaseTargets({ objective, tdee, weightKg, isTrainingDay });
  const proteinTarget = baseTargets.proteines_g;
  const computedLipides = baseTargets.lipides_g;
  const computedGlucides = baseTargets.glucides_g;

  const sleepTargetH = Math.floor(sleepTarget / 60);
  const sleepTargetM = sleepTarget % 60;
  const sleepTargetLabel = sleepTargetM > 0 ? `${sleepTargetH}h${sleepTargetM.toString().padStart(2, "0")}` : `${sleepTargetH}h`;

  // Strain du jour — baseline sur 30j
  const todayMetrics = (metricsRes.data ?? []).find((m) => m.date === today);
  const activeKcalToday = todayMetrics?.active_kcal ?? 0;
  const { data: past30Data } = await supabase
    .from("daily_metrics")
    .select("active_kcal")
    .gte("date", thirtyDaysAgo)
    .lt("date", today);
  const past30Kcal = (past30Data ?? []).map((m) => m.active_kcal ?? 0);
  const strain = computeStrainScore(activeKcalToday, past30Kcal);

  // Sommeil lisible pour chaque jour
  const metricsWithReadableSleep = (metricsRes.data ?? []).map((m) => {
    const sleepMin = m.sleep_total_min;
    const sleepLabel = sleepMin != null
      ? `${Math.floor(sleepMin / 60)}h${Math.round(sleepMin % 60).toString().padStart(2, "0")}`
      : null;
    return { ...m, sleep_readable: sleepLabel };
  });

  // ─── Meal Slots du jour ──────────────────────────────────────
  const slotsConfig = (config as Record<string, unknown>).meal_slots_config as MealSlot[] | null ?? DEFAULT_SLOTS;
  const profilesConfig = (config as Record<string, unknown>).day_profiles_config as DayProfilesConfig | null ?? DEFAULT_PROFILES;
  const workoutsWithType = todayWorkouts.filter((w) => w.type != null) as { type: string }[];
  const dayProfile = detectDayProfile(workoutsWithType, planned);

  let estRemainingKcal = 0;
  for (const r of remainingPlanned) {
    estRemainingKcal += estimateKcal(r.type, r.count);
  }
  const adjusted = computeAdjustedTargets({
    baseTargets,
    objective,
    bmr,
    tdee,
    activeKcalToday,
    estimatedRemainingKcal: estRemainingKcal,
    isTrainingDay,
  });
  const adjustedCalTarget = adjusted.calories;
  const adjustedGlu = adjusted.glucides_g;

  const effectiveTargets = {
    calories: adjustedCalTarget,
    proteines_g: proteinTarget,
    glucides_g: adjustedGlu,
    lipides_g: computedLipides,
  };

  const slotTargetsMap = computeSlotTargets(profilesConfig[dayProfile], effectiveTargets, slotsConfig);

  const nowParis = new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Paris" });
  const currentHour = parseInt(nowParis, 10);

  const todayMeals = (mealRes.data ?? []).filter((m) => m.date === today).map((m) => ({
    id: m.id,
    label: m.label ?? null,
    calories: m.calories,
    proteines_g: m.proteines_g,
    glucides_g: m.glucides_g,
    lipides_g: m.lipides_g,
    logged_at: m.logged_at,
  }));
  const todayProteins = (proteinRes.data ?? []).filter((p) => p.date === today).map((p) => ({
    id: p.id,
    grams: p.grams,
    label: p.label ?? null,
    logged_at: p.logged_at,
  }));

  const rawSlotStates = computeSlotStates(todayMeals, todayProteins, slotsConfig, slotTargetsMap, currentHour);
  const slotStates = redistributeDelta(rawSlotStates);

  // Résumé compact des slots pour le prompt IA
  const mealSlotsForAi = slotStates.map((s) => ({
    slot: s.slot.label,
    hours: `${s.slot.startHour}h-${s.slot.endHour}h`,
    status: s.status,
    current: { cal: s.current.calories, p: s.current.proteines_g, g: s.current.glucides_g, l: s.current.lipides_g },
    target: { cal: s.adjustedTargets.calories, p: s.adjustedTargets.proteines_g, g: s.adjustedTargets.glucides_g, l: s.adjustedTargets.lipides_g },
    meals: s.meals.length + s.proteinLogs.length,
  }));

  // Macros restantes globales
  const remainingMacros = slotStates
    .filter((s) => s.status === "active" || s.status === "future")
    .reduce(
      (acc, s) => ({
        calories: acc.calories + Math.max(0, s.adjustedTargets.calories - s.current.calories),
        proteines_g: acc.proteines_g + Math.max(0, s.adjustedTargets.proteines_g - s.current.proteines_g),
        glucides_g: acc.glucides_g + Math.max(0, s.adjustedTargets.glucides_g - s.current.glucides_g),
        lipides_g: acc.lipides_g + Math.max(0, s.adjustedTargets.lipides_g - s.current.lipides_g),
      }),
      { calories: 0, proteines_g: 0, glucides_g: 0, lipides_g: 0 },
    );

  // Résumé pré-calculé des workouts par jour et par type (source de vérité)
  const workoutsByDayAndType: Record<string, Record<string, number>> = {};
  for (const w of (workoutsRes.data ?? [])) {
    const date = w.started_at.slice(0, 10);
    const normalized = normalizeWorkoutType(w.type ?? "");
    if (!workoutsByDayAndType[date]) workoutsByDayAndType[date] = {};
    workoutsByDayAndType[date][normalized] = (workoutsByDayAndType[date][normalized] ?? 0) + 1;
  }

  return {
    today,
    targets: {
      calories: baseTargets.calories,
      adjustedCalories: adjustedCalTarget,
      proteines_g: proteinTarget,
      glucides_g: computedGlucides,
      adjustedGlucides_g: adjustedGlu,
      lipides_g: computedLipides,
      sleepMin: sleepTarget,
      sleepLabel: sleepTargetLabel,
      steps: stepsTarget,
    },
    strain: {
      score: strain.score,
      level: strain.label,
      activeKcalToday: strain.activeKcalToday,
      baselineAvg: strain.baselineAvg,
    },
    objective,
    isTrainingDay,
    dayProfile,
    mealSlots: mealSlotsForAi,
    remainingMacros,
    currentHour,
    dailyMetrics: metricsWithReadableSleep,
    workoutsByDayAndType,
    workouts: (workoutsRes.data ?? []).map((w) => ({
      ...w,
      typeNormalized: normalizeWorkoutType(w.type ?? ""),
    })),
    bodyComposition: bodyRes.data ?? [],
    nutritionByDay: Object.fromEntries(nutritionByDay),
    plannedActivities: plannedRes.data ?? [],
    hasPlannedActivities: (plannedRes.data ?? []).length > 0,
    completedToday,
    remainingPlanned,
    journal: journalRes.data ?? [],
  };
}

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  const supabase = createServiceClient();

  const [latestSync, cached] = await Promise.all([
    getLatestDataVersion(supabase),
    getCachedInsights(supabase),
  ]);

  // TTL minimum 2h — ne pas régénérer juste parce qu'un sync est arrivé
  const cacheAge = cached?.generated_at
    ? Date.now() - new Date(cached.generated_at).getTime()
    : Infinity;
  const TTL_MS = 2 * 60 * 60 * 1000; // 2 heures

  if (
    !forceRefresh &&
    cached &&
    (cacheAge < TTL_MS || (latestSync && cached.data_version >= latestSync))
  ) {
    return NextResponse.json({
      ...(cached.content as AiInsightsContent),
      generatedAt: cached.generated_at,
      cached: true,
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Clé API Anthropic non configurée" }, { status: 500 });
  }

  const [data, profile] = await Promise.all([
    fetchContextData(supabase),
    getUserProfile(),
  ]);

  const systemWithProfile = SYSTEM_PROMPT + profileToPromptBlock(profile);

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: systemWithProfile,
      messages: [{
        role: "user",
        content: `Analyse mes données et génère les tendances, recommandations et suggestion workout pour aujourd'hui (${data.today}).\n\nDonnées :\n${JSON.stringify(data)}`,
      }],
    });

    logApiUsage({
      endpoint: "ai-insights",
      model: "claude-haiku-4-5-20251001",
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    const rawText = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonStr = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("[ai-insights] JSON parse failed:", parseErr, "raw:", rawText.slice(0, 500));
      return NextResponse.json({ error: "Réponse IA invalide" }, { status: 502 });
    }

    const parsed = {
      trends: (Array.isArray(raw.trends) ? raw.trends : []) as AiTrend[],
      recommendations: (Array.isArray(raw.recommendations) ? raw.recommendations : []) as AiRecommendation[],
      workoutSuggestion: (raw.workoutSuggestion ?? raw.workout_suggestion ?? {
        type: "Repos", intensity: "légère", duration: "30 min",
        reason: "Données insuffisantes", factors: [],
      }) as AiWorkoutReco,
    };

    const now = new Date().toISOString();
    const content: AiInsightsContent = {
      ...parsed,
      generatedAt: now,
    };

    await supabase.from("ai_cache").upsert(
      {
        type: "daily_insights",
        content: content as unknown as Record<string, unknown>,
        generated_at: now,
        data_version: latestSync ?? now,
      },
      { onConflict: "type" },
    );

    return NextResponse.json({ ...content, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
