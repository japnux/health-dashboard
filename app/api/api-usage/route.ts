import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase/service";
import { computeCost } from "@/lib/api-usage";
import { getUserTz } from "@/lib/user-tz";
import { dateInTz, isoDateMinusDays, todayIso } from "@/lib/dates";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

// Nom lisible de chaque fonction qui appelle l'IA (clé "endpoint" des logs)
const FEATURE_LABELS: Record<string, string> = {
  "ai-insights": "Tendances et séance suggérée",
  "ai-analysis/daily": "Analyse du jour",
  "ai-analysis/weekly": "Analyse de la semaine",
  "ai-analysis/question": "Questions à l'IA",
  "ai-correlations": "Corrélations",
  "ai-analysis/blood-patterns": "Biologie : schémas",
  "ai-analysis/blood-category": "Biologie : catégories",
  "ai-analysis/biomarker": "Biologie : marqueur",
  "blood-tests/parse-pdf": "Biologie : lecture de PDF",
  "meal-photo": "Photos de repas",
  "import/historique": "Import historique",
};

type Agg = { calls: number; input_tokens: number; output_tokens: number; cost_usd: number };
const emptyAgg = (): Agg => ({ calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 });
const round = (v: number, d = 6) => Math.round(v * 10 ** d) / 10 ** d;

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const tz = await getUserTz(supabase);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();

  let rows: { created_at: string; endpoint: string; model: string | null; input_tokens: number; output_tokens: number }[];
  try {
    rows = await fetchAllRows((from, to) =>
      supabase
        .from("api_usage_logs")
        .select("created_at, endpoint, model, input_tokens, output_tokens")
        .gte("created_at", ninetyDaysAgo)
        .order("created_at", { ascending: false })
        .range(from, to),
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }

  const today = todayIso(tz);
  const monthStart = `${today.slice(0, 8)}01`;
  const thirtyDaysAgo = dateInTz(new Date(Date.now() - 30 * 86_400_000), tz);

  const byDay = new Map<string, Agg & { models: Map<string, Agg>; features: Map<string, Agg> }>();
  const features30 = new Map<string, Agg>();
  const total = emptyAgg();
  const month = emptyAgg();
  // 7 derniers jours calendaires (aujourd'hui compris) et les 7 d'avant
  const from7 = isoDateMinusDays(today, 6);
  const from14 = isoDateMinusDays(today, 13);
  let last7 = 0;
  let prev7 = 0;

  const add = (a: Agg, row: (typeof rows)[number], cost: number) => {
    a.calls += 1;
    a.input_tokens += row.input_tokens;
    a.output_tokens += row.output_tokens;
    a.cost_usd += cost;
  };

  for (const row of rows) {
    // Coût recalculé au tarif actuel : les anciennes lignes ont été
    // enregistrées avec un tarif Haiku erroné (0,80 $ / 4 $ au lieu de 1 $ / 5 $)
    const model = row.model ?? "inconnu";
    const cost = computeCost(model, row.input_tokens, row.output_tokens);
    const date = dateInTz(row.created_at, tz);

    const day = byDay.get(date) ?? { ...emptyAgg(), models: new Map(), features: new Map() };
    add(day, row, cost);
    const m = day.models.get(model) ?? emptyAgg();
    add(m, row, cost);
    day.models.set(model, m);
    const f = day.features.get(row.endpoint) ?? emptyAgg();
    add(f, row, cost);
    day.features.set(row.endpoint, f);
    byDay.set(date, day);

    add(total, row, cost);
    if (date >= monthStart) add(month, row, cost);
    if (date >= from7) last7 += cost;
    else if (date >= from14) prev7 += cost;
    if (date >= thirtyDaysAgo) {
      const f30 = features30.get(row.endpoint) ?? emptyAgg();
      add(f30, row, cost);
      features30.set(row.endpoint, f30);
    }
  }

  const list = (m: Map<string, Agg>, label: (k: string) => string) =>
    [...m.entries()]
      .sort(([, a], [, b]) => b.cost_usd - a.cost_usd)
      .map(([key, v]) => ({ key, name: label(key), calls: v.calls, cost_usd: round(v.cost_usd) }));
  const featureLabel = (k: string) => FEATURE_LABELS[k] ?? k;

  const daily = [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, d]) => ({
      date,
      calls: d.calls,
      input_tokens: d.input_tokens,
      output_tokens: d.output_tokens,
      cost_usd: round(d.cost_usd),
      models: list(d.models, (k) => k),
      features: list(d.features, featureLabel),
    }));

  // Estimation du mois : dépense à date rapportée au nombre de jours du mois
  const dayOfMonth = Number(today.slice(8, 10));
  const [y, mo] = today.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();

  return NextResponse.json({
    tz,
    total: { ...total, cost_usd: round(total.cost_usd, 4) },
    month: {
      cost_usd: round(month.cost_usd, 4),
      calls: month.calls,
      projected_usd: round((month.cost_usd / Math.max(1, dayOfMonth)) * daysInMonth, 4),
    },
    week: { last7_usd: round(last7, 4), prev7_usd: round(prev7, 4) },
    features30: list(features30, featureLabel),
    daily,
  });
}
