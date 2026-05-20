import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { logApiUsage } from "@/lib/api-usage";
import { todayIso, isoDaysAgo } from "@/lib/dates";
import { getUserProfile, profileToPromptBlock } from "@/lib/user-profile";
import { normalizeWorkoutType } from "@/lib/workout-types";
import { computeStrainScore } from "@/lib/strain-score";
import { parseObjective, computeBaseTargets } from "@/lib/nutrition-calc";

async function isAuthenticated(): Promise<boolean> {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return false;
  const expected = createHash("sha256")
    .update(pw + "-hd-session")
    .digest("hex");
  const cookieStore = await cookies();
  return cookieStore.get("hd_session")?.value === expected;
}

const SYSTEM_PROMPT = `Tu es un analyste de données santé. Tu cherches des corrélations significatives dans les données biologiques et comportementales de l'utilisateur.

DONNÉES DISPONIBLES :
- dailyMetrics : HRV, FC repos, sommeil (total + phases + sleep_readable), pas, kcal actives, lumière, recovery score
- workouts : type normalisé, durée, kcal (inclut sauna comme modalité de récupération)
- nutritionByDay : calories, protéines, glucides, lipides (agrégé par jour)
- journal : mood (1-5), energy (1-5), stress (1-5) par jour
- bodyComposition : poids, body fat %, masse maigre
- dailyStrain : score de charge (0-10) et niveau par jour
- targets : objectifs caloriques, protéines, sommeil, pas

Règles :
- Analyse les 90 derniers jours de données.
- Cherche des corrélations temporelles (jour J → jour J+1) et simultanées.
- Croise TOUTES les sources : biométrie ↔ nutrition, journal ↔ recovery, strain ↔ sommeil, sauna ↔ HRV/recovery J+1, etc.
- Ne rapporte que les corrélations que les données soutiennent clairement, pas des généralités.
- Cite des valeurs concrètes (moyennes, écarts, nb de jours observés) pour étayer chaque corrélation.
- VÉRIFIE les chiffres : compare les valeurs réelles aux targets fournis avant de conclure.
- 3-6 corrélations max, classées par pertinence.
- HRV en ms, FC en bpm, sommeil en heures (ex: 8h15), poids en kg.
- Favorise les corrélations actionnables (ce que l'utilisateur peut changer).

Réponds UNIQUEMENT en JSON valide, sans markdown ni backticks :
{
  "correlations": [
    {
      "id": "string (identifiant unique court, ex: sleep-recovery)",
      "inputMetric": "string (métrique d'entrée, ex: Sommeil >7h30)",
      "outputMetric": "string (métrique de sortie, ex: Recovery lendemain)",
      "direction": "positive|negative",
      "magnitudePct": number (pourcentage d'impact, ex: 15 pour +15%),
      "description": "string (1-2 phrases avec les valeurs observées)",
      "icon": "string (emoji)"
    }
  ]
}`;

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  const today = todayIso();
  const ninetyDaysAgo = isoDaysAgo(90);

  const supabase = createServiceClient();

  const [latestSyncRes, latestMealRes, latestJournalRes, cachedRes] = await Promise.all([
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
      .from("journal_entries")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("ai_cache")
      .select("*")
      .eq("type", "correlations_90d")
      .single(),
  ]);

  const timestamps = [
    latestSyncRes.data?.[0]?.created_at,
    latestMealRes.data?.[0]?.logged_at,
    latestJournalRes.data?.[0]?.created_at,
  ].filter((t): t is string => t != null);
  const latestSync = timestamps.length > 0 ? timestamps.sort().pop()! : null;
  const cached = cachedRes.data;

  // TTL 24h — les corrélations 90j ne changent pas en quelques heures
  const cacheAge = cached?.generated_at
    ? Date.now() - new Date(cached.generated_at).getTime()
    : Infinity;
  const TTL_MS = 24 * 60 * 60 * 1000; // 24 heures

  if (!forceRefresh && cached && (cacheAge < TTL_MS || (latestSync && cached.data_version >= latestSync))) {
    return NextResponse.json({
      correlations: (cached.content as { correlations: unknown[] }).correlations,
      cached: true,
      generatedAt: cached.generated_at,
      dateRange: { start: ninetyDaysAgo, end: today },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Clé API Anthropic non configurée" }, { status: 500 });
  }

  const [metricsRes, workoutsRes, proteinRes, mealRes, journalRes, bodyRes, configRes, profile] = await Promise.all([
    supabase
      .from("daily_metrics")
      .select("date, hrv_ms, resting_hr_bpm, sleep_total_min, sleep_rem_pct, sleep_deep_pct, steps, active_kcal, daylight_min, recovery_score")
      .gte("date", ninetyDaysAgo)
      .lte("date", today)
      .order("date", { ascending: true }),
    supabase
      .from("workouts")
      .select("started_at, type, duration_min, kcal")
      .gte("started_at", `${ninetyDaysAgo}T00:00:00`)
      .order("started_at", { ascending: true }),
    supabase
      .from("protein_logs")
      .select("date, grams")
      .gte("date", ninetyDaysAgo)
      .lte("date", today),
    supabase
      .from("meal_logs")
      .select("date, calories, proteines_g, glucides_g, lipides_g")
      .gte("date", ninetyDaysAgo)
      .lte("date", today),
    supabase
      .from("journal_entries")
      .select("date, mood, energy, stress")
      .gte("date", ninetyDaysAgo)
      .lte("date", today)
      .order("date", { ascending: true }),
    supabase
      .from("body_composition")
      .select("measured_at, weight_kg, body_fat_pct, lean_mass_kg")

      .gte("measured_at", ninetyDaysAgo)
      .lte("measured_at", today)
      .order("measured_at", { ascending: true }),
    supabase
      .from("dashboard_config")
      .select("*")
      .eq("id", 1)
      .single(),
    getUserProfile(),
  ]);

  // Nutrition agrégée par jour (meal_logs + protein_logs)
  const nutritionByDay: Record<string, { calories: number; proteines_g: number; glucides_g: number; lipides_g: number }> = {};
  for (const row of mealRes.data ?? []) {
    const prev = nutritionByDay[row.date] ?? { calories: 0, proteines_g: 0, glucides_g: 0, lipides_g: 0 };
    nutritionByDay[row.date] = {
      calories: prev.calories + row.calories,
      proteines_g: prev.proteines_g + row.proteines_g,
      glucides_g: prev.glucides_g + row.glucides_g,
      lipides_g: prev.lipides_g + row.lipides_g,
    };
  }
  for (const row of proteinRes.data ?? []) {
    const prev = nutritionByDay[row.date] ?? { calories: 0, proteines_g: 0, glucides_g: 0, lipides_g: 0 };
    nutritionByDay[row.date] = {
      ...prev,
      proteines_g: prev.proteines_g + row.grams,
    };
  }

  // Strain quotidien
  const allKcals = (metricsRes.data ?? []).map((m) => m.active_kcal ?? 0);
  const dailyStrain = (metricsRes.data ?? []).map((m, i) => {
    const past = allKcals.slice(0, i).filter((v) => v > 0);
    const result = computeStrainScore(m.active_kcal ?? 0, past);
    return { date: m.date, score: result.score, level: result.level };
  });

  // Config et objectifs
  const config = (configRes.data ?? {}) as Record<string, number | string | null>;
  const tdee = (config.tdee_kcal ?? 2755) as number;
  const objective = parseObjective(config.user_objective as string | null);
  const latestBodyCorr = (bodyRes.data ?? [])[0];
  const weightKg = (latestBodyCorr?.weight_kg ?? 70) as number;
  const baseTargets = computeBaseTargets({ objective, tdee, weightKg, isTrainingDay: true });
  const targets = {
    calories: baseTargets.calories,
    proteines_g: baseTargets.proteines_g,
    sleepMin: (config.sleep_target_min ?? 450) as number,
    steps: (config.steps_target ?? 10000) as number,
  };

  // Sommeil lisible
  const metricsWithReadableSleep = (metricsRes.data ?? []).map((m) => {
    const sleepMin = m.sleep_total_min;
    const sleepLabel = sleepMin != null
      ? `${Math.floor(sleepMin / 60)}h${Math.round(sleepMin % 60).toString().padStart(2, "0")}`
      : null;
    return { ...m, sleep_readable: sleepLabel };
  });

  const contextData = {
    period: { start: ninetyDaysAgo, end: today, days: 90 },
    targets,
    dailyMetrics: metricsWithReadableSleep,
    workouts: (workoutsRes.data ?? []).map((w) => ({
      ...w,
      typeNormalized: normalizeWorkoutType(w.type ?? ""),
    })),
    nutritionByDay,
    journal: journalRes.data ?? [],
    bodyComposition: bodyRes.data ?? [],
    dailyStrain,
  };

  const systemWithProfile = SYSTEM_PROMPT + profileToPromptBlock(profile);

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: systemWithProfile,
      messages: [{
        role: "user",
        content: `Analyse les corrélations dans mes données des 90 derniers jours.\n\nDonnées :\n${JSON.stringify(contextData)}`,
      }],
    });

    logApiUsage({
      endpoint: "ai-correlations",
      model: "claude-haiku-4-5-20251001",
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    const rawText = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonStr = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let parsed: { correlations: unknown[] };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({ error: "Réponse IA invalide" }, { status: 502 });
    }

    const now = new Date().toISOString();
    await supabase.from("ai_cache").upsert(
      {
        type: "correlations_90d",
        content: parsed as unknown as Record<string, unknown>,
        generated_at: now,
        data_version: latestSync ?? now,
      },
      { onConflict: "type" },
    );

    return NextResponse.json({
      correlations: parsed.correlations,
      cached: false,
      generatedAt: now,
      dateRange: { start: ninetyDaysAgo, end: today },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
