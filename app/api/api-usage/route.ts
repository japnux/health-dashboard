import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";

async function isAuthenticated(): Promise<boolean> {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return false;
  const expected = createHash("sha256")
    .update(pw + "-hd-session")
    .digest("hex");
  const cookieStore = await cookies();
  return cookieStore.get("hd_session")?.value === expected;
}

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Récupérer les 90 derniers jours de logs
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from("api_usage_logs")
    .select("created_at, endpoint, model, input_tokens, output_tokens, cost_usd, cached")
    .gte("created_at", ninetyDaysAgo)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Agréger par jour
  const byDay: Record<string, {
    date: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    endpoints: Record<string, { calls: number; cost_usd: number }>;
    models: Record<string, { calls: number; cost_usd: number }>;
  }> = {};

  for (const row of rows ?? []) {
    const date = row.created_at.slice(0, 10);
    if (!byDay[date]) {
      byDay[date] = { date, calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0, endpoints: {}, models: {} };
    }
    const day = byDay[date];
    day.calls += 1;
    day.input_tokens += row.input_tokens;
    day.output_tokens += row.output_tokens;
    day.cost_usd += Number(row.cost_usd);

    const ep = row.endpoint;
    if (!day.endpoints[ep]) day.endpoints[ep] = { calls: 0, cost_usd: 0 };
    day.endpoints[ep].calls += 1;
    day.endpoints[ep].cost_usd += Number(row.cost_usd);

    const model = row.model ?? "unknown";
    if (!day.models[model]) day.models[model] = { calls: 0, cost_usd: 0 };
    day.models[model].calls += 1;
    day.models[model].cost_usd += Number(row.cost_usd);
  }

  // Trier par date décroissante
  const daily = Object.values(byDay)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((d) => ({
      ...d,
      cost_usd: Math.round(d.cost_usd * 1_000_000) / 1_000_000,
      endpoints: Object.entries(d.endpoints)
        .sort(([, a], [, b]) => b.cost_usd - a.cost_usd)
        .map(([name, v]) => ({
          name,
          calls: v.calls,
          cost_usd: Math.round(v.cost_usd * 1_000_000) / 1_000_000,
        })),
      models: Object.entries(d.models)
        .sort(([, a], [, b]) => b.cost_usd - a.cost_usd)
        .map(([name, v]) => ({
          name,
          calls: v.calls,
          cost_usd: Math.round(v.cost_usd * 1_000_000) / 1_000_000,
        })),
    }));

  // Totaux
  const totalCost = daily.reduce((s, d) => s + d.cost_usd, 0);
  const totalCalls = daily.reduce((s, d) => s + d.calls, 0);
  const totalInput = daily.reduce((s, d) => s + d.input_tokens, 0);
  const totalOutput = daily.reduce((s, d) => s + d.output_tokens, 0);

  return NextResponse.json({
    total: {
      cost_usd: Math.round(totalCost * 100) / 100,
      calls: totalCalls,
      input_tokens: totalInput,
      output_tokens: totalOutput,
    },
    daily,
  });
}
