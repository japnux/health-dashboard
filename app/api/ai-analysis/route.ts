import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { logApiUsage } from "@/lib/api-usage";
import { BIOMARKERS_BY_KEY } from "@/lib/biomarkers";
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

// ─── Prompts ────────────────────────────────────────────────────────────

const WEEKLY_SYSTEM_PROMPT = `Tu es un coach santé et performance personnel. Tu analyses les données biologiques et d'activité de l'utilisateur pour donner des insights concrets et actionnables.

Règles :
- Réponses courtes, directes, structurées.
- Identifie des patterns et corrélations dans les données (ex: lien sommeil/HRV, impact workout sur recovery, effet sauna sur HRV et recovery J+1).
- 2-3 recommandations max, spécifiques aux données observées.
- Pas de généralités médicales ni de disclaimers.
- Si une tendance est préoccupante, signale-la clairement dans le champ alert.
- Utilise les unités du dashboard : HRV en ms, FC en bpm, sommeil TOUJOURS en XhYY (ex: 6h44, 7h30, jamais en minutes brutes), poids en kg.
- Nutrition : utilise les "targets" fournis dans les données (calories, protéines, glucides, lipides). Ne hardcode pas de valeurs.
- MEAL SLOTS : la journée est découpée en créneaux repas. "mealSlots" contient l'état de chaque slot. "remainingMacros" = macros restantes à consommer. Utilise ces données pour des recos nutrition concrètes.
- Le strain score (0-10) indique la charge du jour. Tiens-en compte.
- Activités prévues : compare plannedActivities avec workouts réalisés. completedToday = fait, remainingPlanned = à venir.

- RESPIRATION & SpO2 : les daily_metrics incluent respiratory_rate (/min) et spo2_pct (%). Une fréq. respi élevée par rapport à la moyenne des jours précédents indique du stress, une congestion ou une récupération incomplète. Une SpO2 < 95% est inhabituelle. Intègre ces signaux dans ton analyse recovery/sommeil. Corrèle avec HRV et FC repos (respi haute + HRV basse = stress sympathique). Si SpO2 < 93%, signale-le dans l'alerte.
- BIOLOGIE : si bloodTests est présent et non vide, intègre les marqueurs hors plage optimale dans ton analyse. Marqueurs critiques à surveiller : ApoB, HbA1c, Vitamine D, B12, Ferritine, hsCRP, Homocystéine, Testostérone, DHEA. Si le bilan est ancien (>90j), mentionne qu'un nouveau bilan serait utile. Relie les carences aux symptômes observés (ex: ferritine basse + fatigue, B12 basse + recovery).

Emojis : commence chaque insight et recommandation par un emoji pertinent pour le sujet :
😴 sommeil, 💚 HRV/recovery, ❤️ FC repos, 🏄 surf, 🏋️ muscu, 🏃 activité/pas, 🍽️ nutrition/calories, 🥩 protéines, 🧈 lipides, ⚖️ poids/composition, 🫁 respiration/SpO2, 🔥 strain/charge, 📊 tendance générale, ⚡ énergie, 🧠 mental/stress, 🧬 biologie/sang, 💊 vitamines/minéraux, 🥵 sauna.

Tu dois répondre UNIQUEMENT en JSON valide, sans markdown ni backticks, avec cette structure exacte :
{
  "summary": "Résumé en 1-2 phrases de l'état général",
  "insights": ["😴 insight sommeil", "💚 insight HRV", ...],
  "recommendations": ["🏄 reco 1", "🍽️ reco 2"],
  "alert": "message d'alerte si tendance préoccupante, sinon null"
}`;

const BLOOD_CATEGORY_SYSTEM_PROMPT = `Tu es un médecin fonctionnel spécialisé en biologie préventive. Tu analyses les résultats de bilans sanguins d'un patient et tu donnes des insights personnalisés.

Règles :
- Réponses structurées, directes, orientées action.
- Analyse chaque marqueur par rapport aux plages de référence optimales (pas juste les normes labo).
- Identifie les tendances entre bilans successifs.
- 2-4 recommandations concrètes (suppléments, alimentation, mode de vie).
- Pas de disclaimers ni de généralités. Sois spécifique aux valeurs observées.
- Si un marqueur est critique (très hors plage), signale-le clairement dans alert.
- Utilise les emojis pertinents en début de chaque point.

Tu dois répondre UNIQUEMENT en JSON valide, sans markdown ni backticks, avec cette structure exacte :
{
  "summary": "Résumé en 1-2 phrases de l'état de cette catégorie",
  "insights": ["🔬 insight 1", "📊 insight 2", ...],
  "recommendations": ["💊 reco 1", "🥗 reco 2", ...],
  "alert": "message d'alerte si marqueur critique, sinon null"
}`;

const QUESTION_SYSTEM_PROMPT = `Tu es un coach santé et performance personnel. L'utilisateur te pose une question sur ses données de santé.

Règles :
- Réponds directement en français, de manière concise et structurée.
- Utilise les données fournies pour répondre de manière spécifique et personnalisée.
- Pas de généralités médicales ni de disclaimers.
- Utilise les unités : HRV en ms, FC en bpm, sommeil en XhYY, poids en kg.
- Si la question porte sur la nutrition, utilise les targets et les données de meal slots fournis.
- Sois concis : 3-5 phrases max sauf si la question demande plus de détail.
- Ne réponds PAS en JSON. Réponds en texte normal.`;

const BLOOD_PATTERNS_SYSTEM_PROMPT = `Tu es un médecin fonctionnel expert en biologie préventive. Tu analyses l'ensemble des résultats d'un bilan sanguin pour détecter des PATTERNS CLINIQUES COHÉRENTS entre marqueurs.

Objectif : ne PAS analyser chaque marqueur isolément, mais croiser les marqueurs pour identifier des tableaux cliniques (syndromes, carences combinées, déséquilibres systémiques).

Exemples de patterns à détecter :
- Ferritine basse + hsCRP élevée + leucocytes hauts = inflammation chronique masquant une carence en fer
- HbA1c limite + triglycérides élevés + HOMA-IR haut = résistance à l'insuline précoce
- TSH haute + T3 basse + ferritine basse = hypothyroïdie fonctionnelle par carence en fer
- Homocystéine haute + B12 basse + B9 basse = déficit de méthylation
- Testostérone basse + SHBG haute + cortisol élevé = axe HHS perturbé
- Vitamine D basse + calcium limite + ALP élevée = métabolisme osseux perturbé

Règles :
- Ne reporte QUE les patterns étayés par les données. Ne force pas de pattern si les marqueurs sont normaux.
- Chaque pattern doit lier ≥2 marqueurs.
- Classe par sévérité : "critical" (action immédiate), "warning" (à surveiller), "info" (optimisation).
- Sois spécifique aux valeurs du patient.
- 2-5 patterns max. Si tout est optimal, retourne un array vide.

Réponds UNIQUEMENT en JSON valide, sans markdown ni backticks :
{
  "patterns": [
    {
      "id": "string (ex: insulin-resistance)",
      "title": "string (ex: Résistance à l'insuline précoce)",
      "severity": "critical" | "warning" | "info",
      "markers": ["biomarker_key1", "biomarker_key2"],
      "markerDetails": "string (ex: HbA1c 5.4% ↑ + TG 145 mg/dL ↑ + HOMA-IR 2.1 ↑)",
      "description": "string (2-3 phrases expliquant le pattern et son impact)",
      "actions": ["string (action concrète 1)", "string (action concrète 2)"],
      "icon": "string (emoji)"
    }
  ],
  "globalNote": "string ou null (observation générale si pertinent)"
}`;

type AnalysisRequest = {
  mode: "weekly" | "daily" | "question" | "blood_category" | "biomarker_detail" | "blood_patterns";
  question?: string;
  category?: string;
  biomarkerKey?: string;
};

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const url = new URL(request.url);
  const cacheType = url.searchParams.get("type") ?? "weekly_analysis";

  const supabase = createServiceClient();

  // Cache blood_patterns
  if (cacheType === "blood_patterns_latest") {
    const cachedRes = await supabase.from("ai_cache").select("*").eq("type", cacheType).single();
    if (cachedRes.data) {
      return NextResponse.json({
        ...(cachedRes.data.content as Record<string, unknown>),
        generatedAt: cachedRes.data.generated_at,
        cached: true,
      });
    }
    return NextResponse.json({ cached: false, patterns: [], globalNote: null });
  }

  // Pour les analyses blood_cat_*, pas de vérification data_version (pas lié aux syncs)
  if (cacheType.startsWith("blood_cat_")) {
    const cachedRes = await supabase.from("ai_cache").select("*").eq("type", cacheType).single();
    if (cachedRes.data) {
      const content = cachedRes.data.content as Record<string, unknown>;
      let repaired = content;
      if (typeof content.summary === "string" && content.summary.trimStart().startsWith("{")) {
        try {
          const parsed = JSON.parse(content.summary);
          if (parsed.summary) repaired = parsed;
        } catch { /* on garde content tel quel */ }
      }
      return NextResponse.json({
        ...repaired,
        generatedAt: cachedRes.data.generated_at,
        cached: true,
      });
    }
    return NextResponse.json({ cached: false });
  }

  const [cachedRes, syncRes] = await Promise.all([
    supabase.from("ai_cache").select("*").eq("type", cacheType).single(),
    supabase.from("sync_logs").select("created_at").order("created_at", { ascending: false }).limit(1),
  ]);

  const cached = cachedRes.data;
  const latestSync = syncRes.data?.[0]?.created_at ?? null;

  if (cached && latestSync && cached.data_version >= latestSync) {
    // Réparer les caches corrompus où le JSON brut est dans summary
    const content = cached.content as Record<string, unknown>;
    let repaired = content;
    if (typeof content.summary === "string" && content.summary.trimStart().startsWith("{")) {
      try {
        const parsed = JSON.parse(content.summary);
        if (parsed.summary) repaired = parsed;
      } catch { /* on garde content tel quel */ }
    }
    return NextResponse.json({
      ...repaired,
      generatedAt: cached.generated_at,
      cached: true,
    });
  }

  return NextResponse.json({ cached: false });
}

async function fetchHealthData(days: number) {
  const supabase = createServiceClient();
  const today = todayIso();
  const startDate = isoDaysAgo(days);

  const [metricsRes, workoutsRes, bodyRes, proteinRes, journalRes, mealRes, plannedRes, configRes, bloodTestsRes] =
    await Promise.all([
      supabase
        .from("daily_metrics")
        .select(
          "date, hrv_ms, resting_hr_bpm, respiratory_rate, spo2_pct, sleep_total_min, sleep_rem_pct, sleep_deep_pct, steps, active_kcal, daylight_min, recovery_score",
        )
        .gte("date", startDate)
        .lte("date", today)
        .order("date", { ascending: true }),
      supabase
        .from("workouts")
        .select("started_at, type, duration_min, kcal")
        .gte("started_at", `${startDate}T00:00:00`)
        .order("started_at", { ascending: true }),
      supabase
        .from("body_composition")
        .select("measured_at, weight_kg, body_fat_pct, lean_mass_kg")

        .order("measured_at", { ascending: false })
        .limit(5),
      supabase
        .from("protein_logs")
        .select("id, date, grams, label, logged_at")
        .gte("date", startDate)
        .lte("date", today),
      supabase
        .from("journal_entries")
        .select("date, mood, energy, stress, notes")
        .gte("date", startDate)
        .lte("date", today)
        .order("date", { ascending: true }),
      supabase
        .from("meal_logs")
        .select("id, date, label, calories, proteines_g, glucides_g, lipides_g, logged_at")
        .gte("date", startDate)
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
      supabase
        .from("blood_tests")
        .select("test_date, lab_name, biological_age, blood_test_results(biomarker_key, label, value, unit, ref_min, ref_max, category)")
        .order("test_date", { ascending: false })
        .limit(2),
    ]);

  // Nutrition agrégée par jour
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

  // Config et objectifs
  const config = (configRes.data ?? {}) as Record<string, number | string | null>;
  const bmr = (config.bmr_kcal ?? 1670) as number;
  const tdee = (config.tdee_kcal ?? 2755) as number;
  const latestBody = (bodyRes.data ?? [])[0];
  const weightKg = (latestBody?.weight_kg ?? 70) as number;
  const objective = parseObjective(config.user_objective as string | null);

  // Workouts et activités
  const allWorkouts = workoutsRes.data ?? [];
  const todayWorkouts = allWorkouts.filter((w) => w.started_at.startsWith(today));
  const planned = plannedRes.data ?? [];
  const isTrainingDay = todayWorkouts.length > 0 || planned.length > 0;

  const doneCountByType = new Map<string, number>();
  for (const w of todayWorkouts) {
    const normalized = normalizeWorkoutType(w.type ?? "");
    doneCountByType.set(normalized, (doneCountByType.get(normalized) ?? 0) + 1);
  }

  const completedToday: { type: string; count: number }[] = [];
  const remainingPlanned: { type: string; count: number }[] = [];
  for (const p of planned) {
    const done = doneCountByType.get(p.type.toLowerCase()) ?? 0;
    if (done > 0) completedToday.push({ type: p.type, count: Math.min(done, p.count) });
    const remaining = p.count - done;
    if (remaining > 0) remainingPlanned.push({ type: p.type, count: remaining });
  }

  let estimatedRemainingKcal = 0;
  for (const r of remainingPlanned) {
    estimatedRemainingKcal += estimateKcal(r.type, r.count);
  }

  // Macros de base + ajustement
  const baseTargets = computeBaseTargets({ objective, tdee, weightKg, isTrainingDay });
  const proteinTarget = baseTargets.proteines_g;
  const computedLipides = baseTargets.lipides_g;
  const computedGlucides = baseTargets.glucides_g;

  // Strain
  const todayMetrics = (metricsRes.data ?? []).find((m) => m.date === today);
  const activeKcalToday = todayMetrics?.active_kcal ?? 0;
  const past7dKcal = (metricsRes.data ?? [])
    .filter((m) => m.date !== today)
    .map((m) => m.active_kcal ?? 0);
  const strain = computeStrainScore(activeKcalToday, past7dKcal);

  // Targets ajustés temps réel
  const adjusted = computeAdjustedTargets({
    baseTargets,
    objective,
    bmr,
    tdee,
    activeKcalToday,
    estimatedRemainingKcal,
    isTrainingDay,
  });
  const adjustedCalTarget = adjusted.calories;
  const adjustedGlu = adjusted.glucides_g;

  // Meal Slots
  const slotsConfig = (config as Record<string, unknown>).meal_slots_config as MealSlot[] | null ?? DEFAULT_SLOTS;
  const profilesConfig = (config as Record<string, unknown>).day_profiles_config as DayProfilesConfig | null ?? DEFAULT_PROFILES;
  const workoutsWithType = todayWorkouts.filter((w) => w.type != null) as { type: string }[];
  const dayProfile = detectDayProfile(workoutsWithType, planned);

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

  const mealSlotsForAi = slotStates.map((s) => ({
    slot: s.slot.label,
    hours: `${s.slot.startHour}h-${s.slot.endHour}h`,
    status: s.status,
    current: { cal: s.current.calories, p: s.current.proteines_g, g: s.current.glucides_g, l: s.current.lipides_g },
    target: { cal: s.adjustedTargets.calories, p: s.adjustedTargets.proteines_g, g: s.adjustedTargets.glucides_g, l: s.adjustedTargets.lipides_g },
    meals: s.meals.length + s.proteinLogs.length,
  }));

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

  // Sommeil lisible
  const metricsWithReadableSleep = (metricsRes.data ?? []).map((m) => {
    const sleepMin = m.sleep_total_min;
    const sleepLabel = sleepMin != null
      ? `${Math.floor(sleepMin / 60)}h${Math.round(sleepMin % 60).toString().padStart(2, "0")}`
      : null;
    return { ...m, sleep_readable: sleepLabel };
  });

  return {
    today,
    currentHour,
    targets: {
      calories: baseTargets.calories,
      adjustedCalories: adjustedCalTarget,
      proteines_g: proteinTarget,
      glucides_g: computedGlucides,
      adjustedGlucides_g: adjustedGlu,
      lipides_g: computedLipides,
      sleepMin: (config.sleep_target_min ?? 450) as number,
      steps: (config.steps_target ?? 10000) as number,
    },
    strain: {
      score: strain.score,
      level: strain.label,
      activeKcalToday: strain.activeKcalToday,
      baselineAvg: strain.baselineAvg,
    },
    dayProfile,
    mealSlots: mealSlotsForAi,
    remainingMacros,
    period: { start: startDate, end: today, days },
    dailyMetrics: metricsWithReadableSleep,
    workouts: allWorkouts.map((w) => ({
      ...w,
      typeNormalized: normalizeWorkoutType(w.type ?? ""),
    })),
    bodyComposition: bodyRes.data ?? [],
    nutritionByDay: Object.fromEntries(nutritionByDay),
    plannedActivities: planned,
    completedToday,
    remainingPlanned,
    estimatedRemainingKcal,
    journal: journalRes.data ?? [],
    bloodTests: (bloodTestsRes.data ?? []).map((t: Record<string, unknown>) => ({
      test_date: t.test_date,
      lab_name: t.lab_name,
      biological_age: t.biological_age,
      results: (t.blood_test_results as { biomarker_key: string; label: string; value: number; unit: string; ref_min: number | null; ref_max: number | null; category: string }[])?.map((r) => {
        const def = BIOMARKERS_BY_KEY.get(r.biomarker_key);
        const optMin = def?.refMin ?? r.ref_min;
        const optMax = def?.refMax ?? r.ref_max;
        return {
          key: r.biomarker_key,
          label: r.label,
          value: r.value,
          unit: r.unit,
          optimal_min: optMin,
          optimal_max: optMax,
          category: r.category,
          status: optMax != null && r.value > optMax ? "élevé" : optMin != null && r.value < optMin ? "bas" : "optimal",
        };
      }) ?? [],
    })),
  };
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Clé API Anthropic non configurée" },
      { status: 500 },
    );
  }

  let body: AnalysisRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const { mode, question, category, biomarkerKey } = body;
  if (mode !== "weekly" && mode !== "daily" && mode !== "question" && mode !== "blood_category" && mode !== "biomarker_detail" && mode !== "blood_patterns") {
    return NextResponse.json({ error: "Mode invalide" }, { status: 400 });
  }
  if (mode === "question" && (!question || question.trim().length === 0)) {
    return NextResponse.json({ error: "Question requise" }, { status: 400 });
  }
  if (mode === "blood_category" && (!category || category.trim().length === 0)) {
    return NextResponse.json({ error: "Catégorie requise" }, { status: 400 });
  }
  if (mode === "biomarker_detail" && (!biomarkerKey || biomarkerKey.trim().length === 0)) {
    return NextResponse.json({ error: "Clé biomarqueur requise" }, { status: 400 });
  }

  // Mode blood_patterns : corrélations inter-marqueurs sur le dernier bilan
  if (mode === "blood_patterns") {
    const supabase = createServiceClient();

    // Cache persistant — les patterns ne changent qu'avec un nouveau bilan
    const cacheKey = "blood_patterns_latest";
    const { data: cachedPatterns } = await supabase
      .from("ai_cache")
      .select("*")
      .eq("type", cacheKey)
      .single();

    // Vérifier si le cache est encore valide (même bilan)
    const { data: latestTest } = await supabase
      .from("blood_tests")
      .select("id, test_date")
      .order("test_date", { ascending: false })
      .limit(1)
      .single();

    if (!latestTest) {
      return NextResponse.json({ patterns: [], globalNote: null });
    }

    if (cachedPatterns && cachedPatterns.data_version === latestTest.id) {
      return NextResponse.json({
        ...(cachedPatterns.content as Record<string, unknown>),
        cached: true,
      });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Clé API non configurée" }, { status: 500 });
    }

    // Récupérer tous les résultats du dernier bilan
    const { data: results } = await supabase
      .from("blood_test_results")
      .select("biomarker_key, label, category, value, unit, ref_min, ref_max")
      .eq("test_id", latestTest.id);

    if (!results || results.length === 0) {
      return NextResponse.json({ patterns: [], globalNote: null });
    }

    const profile = await getUserProfile();
    const profileBlock = profileToPromptBlock(profile);
    const systemPrompt = BLOOD_PATTERNS_SYSTEM_PROMPT + profileBlock;

    const markersData = results.map((r) => {
      // Utiliser les plages optimales du registre (plus strictes que les plages labo)
      const def = BIOMARKERS_BY_KEY.get(r.biomarker_key);
      const optMin = def?.refMin ?? r.ref_min;
      const optMax = def?.refMax ?? r.ref_max;
      const status = optMax != null && r.value > optMax ? "élevé"
        : optMin != null && r.value < optMin ? "bas" : "optimal";
      return {
        key: r.biomarker_key,
        label: r.label,
        category: r.category,
        value: r.value,
        unit: r.unit,
        optimal_min: optMin,
        optimal_max: optMax,
        lab_ref_min: r.ref_min,
        lab_ref_max: r.ref_max,
        status,
      };
    });

    const userMessage = `Bilan du ${latestTest.test_date}, ${results.length} marqueurs.\n\nRésultats :\n${JSON.stringify(markersData)}`;

    try {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      logApiUsage({
        endpoint: "ai-analysis/blood-patterns",
        model: "claude-haiku-4-5-20251001",
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      });

      const rawText = response.content[0].type === "text" ? response.content[0].text : "";
      let jsonStr = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      const firstBrace = jsonStr.indexOf("{");
      const lastBrace = jsonStr.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);

      let parsed: { patterns: unknown[]; globalNote: string | null };
      try {
        parsed = JSON.parse(jsonStr);
        parsed = {
          patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
          globalNote: parsed.globalNote ?? null,
        };
      } catch {
        parsed = { patterns: [], globalNote: null };
      }

      // Cache
      const now = new Date().toISOString();
      await supabase.from("ai_cache").upsert(
        {
          type: cacheKey,
          content: parsed as unknown as Record<string, unknown>,
          generated_at: now,
          data_version: latestTest.id,
        },
        { onConflict: "type" },
      );

      return NextResponse.json({ ...parsed, cached: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  // Mode biomarker_detail : description du marqueur + recommandations
  if (mode === "biomarker_detail") {
    const supabase = createServiceClient();

    // Vérifier le cache d'abord
    const cacheKey = `biomarker_${biomarkerKey}`;
    const { data: cachedBiomarker } = await supabase
      .from("ai_cache")
      .select("*")
      .eq("type", cacheKey)
      .single();
    if (cachedBiomarker) {
      return NextResponse.json({
        mode: "biomarker_detail",
        biomarkerKey,
        ...(cachedBiomarker.content as Record<string, unknown>),
      });
    }

    const profile = await getUserProfile();
    const profileBlock = profileToPromptBlock(profile);

    const { data: results } = await supabase
      .from("blood_test_results")
      .select("value, unit, ref_min, ref_max, category, label, blood_tests!inner(test_date)")
      .eq("biomarker_key", biomarkerKey!)
      .order("blood_tests(test_date)", { ascending: true });

    const history = (results ?? []).map((r: Record<string, unknown>) => {
      const bt = r.blood_tests as { test_date: string };
      return { date: bt.test_date, value: r.value as number, unit: r.unit as string, ref_min: r.ref_min, ref_max: r.ref_max };
    });

    const first = results?.[0] as Record<string, unknown> | undefined;
    const markerLabel = first?.label ?? biomarkerKey;
    const markerCategory = first?.category ?? "";

    const systemPrompt = `Tu es un médecin fonctionnel spécialisé en biologie préventive et en médecine de longévité.

Règles :
- Explique ce que mesure ce marqueur, pourquoi il est important pour la santé/longévité.
- Donne le contexte physiologique en 3-4 phrases accessibles.
- Si les valeurs ne sont pas optimales, donne 3-5 recommandations concrètes (suppléments avec dosages, alimentation, mode de vie).
- Si les valeurs sont optimales, félicite brièvement et donne 1-2 conseils de maintien.
- Pas de disclaimers. Sois spécifique aux valeurs observées.
- Utilise des emojis pertinents en début de chaque recommandation.

Tu dois répondre UNIQUEMENT en JSON valide, sans markdown ni backticks :
{
  "description": "Description du marqueur et analyse des valeurs du patient",
  "recommendations": ["💊 reco 1", "🥗 reco 2", ...]
}` + profileBlock;

    const userMessage = `Marqueur : ${markerLabel} (${biomarkerKey}) — catégorie ${markerCategory}.\nHistorique des valeurs :\n${history.map((h) => `${h.date}: ${h.value} ${h.unit} (ref: ${h.ref_min ?? "—"}–${h.ref_max ?? "—"})`).join("\n")}`;

    try {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      logApiUsage({
        endpoint: "ai-analysis/biomarker",
        model: "claude-haiku-4-5-20251001",
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      });

      const rawText = response.content[0].type === "text" ? response.content[0].text : "";
      let jsonStr = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      const firstBrace = jsonStr.indexOf("{");
      const lastBrace = jsonStr.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);

      let parsed: { description: string; recommendations: string[] };
      try {
        parsed = JSON.parse(jsonStr);
        parsed = {
          description: parsed.description ?? "",
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        };
      } catch {
        parsed = { description: rawText.trim(), recommendations: [] };
      }

      // Persister en cache
      const now = new Date().toISOString();
      await supabase.from("ai_cache").upsert(
        {
          type: cacheKey,
          content: parsed as unknown as Record<string, unknown>,
          generated_at: now,
          data_version: now,
        },
        { onConflict: "type" },
      );

      return NextResponse.json({ mode: "biomarker_detail", biomarkerKey, ...parsed });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  // Mode blood_category : analyse ciblée d'une catégorie de marqueurs
  if (mode === "blood_category") {
    const supabase = createServiceClient();
    const profile = await getUserProfile();
    const profileBlock = profileToPromptBlock(profile);

    // Récupérer tous les bilans sanguins
    const bloodTestsRes = await supabase
      .from("blood_tests")
      .select("test_date, lab_name, biological_age, blood_test_results(biomarker_key, label, value, unit, ref_min, ref_max, category)")
      .order("test_date", { ascending: true });

    const tests = (bloodTestsRes.data ?? []) as unknown as {
      test_date: string;
      lab_name: string | null;
      biological_age: number | null;
      blood_test_results: { biomarker_key: string; label: string; value: number; unit: string; ref_min: number | null; ref_max: number | null; category: string }[];
    }[];

    if (tests.length === 0) {
      return NextResponse.json({ error: "Aucun bilan sanguin disponible" }, { status: 404 });
    }

    // Filtrer les résultats de la catégorie demandée
    const categoryData = tests.map((t) => ({
      test_date: t.test_date,
      lab_name: t.lab_name,
      biological_age: t.biological_age,
      markers: t.blood_test_results
        .filter((r) => r.category === category)
        .map((r) => {
          const def = BIOMARKERS_BY_KEY.get(r.biomarker_key);
          const optMin = def?.refMin ?? r.ref_min;
          const optMax = def?.refMax ?? r.ref_max;
          return {
            key: r.biomarker_key,
            label: r.label,
            value: r.value,
            unit: r.unit,
            optimal_min: optMin,
            optimal_max: optMax,
            status: optMax != null && r.value > optMax ? "élevé" : optMin != null && r.value < optMin ? "bas" : "optimal",
          };
        }),
    })).filter((t) => t.markers.length > 0);

    if (categoryData.length === 0) {
      return NextResponse.json({ error: "Aucune donnée pour cette catégorie" }, { status: 404 });
    }

    const categoryLabel = category!;
    const systemPrompt = BLOOD_CATEGORY_SYSTEM_PROMPT + profileBlock;
    const userMessage = `Analyse mes résultats pour la catégorie "${categoryLabel}".\n\nBilans disponibles (du plus ancien au plus récent) :\n${JSON.stringify(categoryData)}`;

    try {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      logApiUsage({
        endpoint: "ai-analysis/blood-category",
        model: "claude-haiku-4-5-20251001",
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      });

      const rawText = response.content[0].type === "text" ? response.content[0].text : "";

      // Extraction robuste du JSON
      let jsonStr = rawText.trim();
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      const firstBrace = jsonStr.indexOf("{");
      const lastBrace = jsonStr.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
      }

      let parsed: { summary: string; insights: string[]; recommendations: string[]; alert: string | null };
      try {
        parsed = JSON.parse(jsonStr);
        parsed = {
          summary: parsed.summary ?? "",
          insights: Array.isArray(parsed.insights) ? parsed.insights : [],
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
          alert: parsed.alert ?? null,
        };
      } catch {
        parsed = { summary: rawText.trim(), insights: [], recommendations: [], alert: null };
      }

      // Cache persistant
      const now = new Date().toISOString();
      await supabase.from("ai_cache").upsert(
        {
          type: `blood_cat_${category}`,
          content: parsed as unknown as Record<string, unknown>,
          generated_at: now,
          data_version: now,
        },
        { onConflict: "type" },
      );

      return NextResponse.json({ mode: "blood_category", category, ...parsed });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  const days = mode === "daily" ? 1 : 7; // question et weekly = 7j
  const [data, profile] = await Promise.all([
    fetchHealthData(days),
    getUserProfile(),
  ]);

  const profileBlock = profileToPromptBlock(profile);

  if (mode === "question") {
    // Mode question : prompt léger, 7j, sans blood tests
    const systemPrompt = QUESTION_SYSTEM_PROMPT + profileBlock;
    const { bloodTests: _bt, ...dataWithoutBlood } = data;
    const userMessage = `${question}\n\nMes données (7 derniers jours) :\n${JSON.stringify(dataWithoutBlood)}`;

    try {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      logApiUsage({
        endpoint: "ai-analysis/question",
        model: "claude-haiku-4-5-20251001",
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      });

      const rawText = response.content[0].type === "text" ? response.content[0].text : "";
      return NextResponse.json({ mode: "question", answer: rawText.trim() });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  const isDaily = mode === "daily";
  const systemPrompt = WEEKLY_SYSTEM_PROMPT + profileBlock;
  const userMessage = isDaily
    ? `Analyse mes données d'aujourd'hui (${data.today}) et donne-moi un bilan de ma journée.\n\nDonnées :\n${JSON.stringify(data)}`
    : `Analyse mes données des 7 derniers jours et donne-moi un bilan de ma semaine.\n\nDonnées :\n${JSON.stringify(data)}`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    logApiUsage({
      endpoint: `ai-analysis/${isDaily ? "daily" : "weekly"}`,
      model: "claude-haiku-4-5-20251001",
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    const rawText = response.content[0].type === "text" ? response.content[0].text : "";

    // Extraction robuste du JSON : chercher le premier { et le dernier }
    let jsonStr = rawText.trim();
    // Retirer les code fences markdown si présentes
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    // Extraire le bloc JSON entre { et }
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
    }

    let parsed: {
      summary: string;
      insights: string[];
      recommendations: string[];
      alert: string | null;
    };
    try {
      parsed = JSON.parse(jsonStr);
      // Garantir la structure même si certains champs manquent
      parsed = {
        summary: parsed.summary ?? "",
        insights: Array.isArray(parsed.insights) ? parsed.insights : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        alert: parsed.alert ?? null,
      };
    } catch {
      // Dernier recours : traiter comme texte libre
      parsed = {
        summary: rawText.trim(),
        insights: [],
        recommendations: [],
        alert: null,
      };
    }

    // Cache
    const supabase = createServiceClient();
    const [syncRes] = await Promise.all([
      supabase.from("sync_logs").select("created_at").order("created_at", { ascending: false }).limit(1),
    ]);
    const latestSync = syncRes.data?.[0]?.created_at ?? new Date().toISOString();
    const now = new Date().toISOString();
    await supabase.from("ai_cache").upsert(
      {
        type: isDaily ? "daily_analysis" : "weekly_analysis",
        content: parsed as unknown as Record<string, unknown>,
        generated_at: now,
        data_version: latestSync,
      },
      { onConflict: "type" },
    );

    return NextResponse.json({ mode: isDaily ? "daily" : "weekly", ...parsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
