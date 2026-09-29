// Rattrapage des horaires de sommeil (coucher, lever) et des siestes à partir
// des envois Health Auto Export conservés dans sync_logs (60 jours).
// Même règle que l'import : la plus longue session du jour est la nuit, les
// autres (10 min ou plus) sont des siestes.
// Usage : npx tsx scripts/backfill-sleep-sessions.ts [--dry]

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { Database } from "@/lib/types";
import type { Nap } from "@/lib/sleep";

// Charger .env.local manuellement (pas de dépendance dotenv)
for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf-8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}

const DRY = process.argv.includes("--dry");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const supabase = createClient<Database>(url, key, opts);
// Client non typé pour lire les chemins JSON de sync_logs
const rawClient = createClient(url, key, opts);

type Rec = Record<string, unknown>;

// "2026-09-20 23:37:34 +0200" → ISO UTC (même conversion que l'import)
function toIso(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = Date.parse(s.trim().replace(" ", "T").replace(/ ?([+-]\d{2})(\d{2})$/, "$1:$2"));
  return isNaN(t) ? null : new Date(t).toISOString();
}

async function main() {
  // Sessions uniques par jour (la plus récente version d'une session l'emporte)
  const byDate = new Map<string, Map<string, { min: number; start: string; end: string }>>();
  const PAGE = 50;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await rawClient
      .from("sync_logs")
      .select("metrics:raw_payload->data->metrics")
      .not("raw_payload", "is", null)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`lecture sync_logs : ${error.message}`);
    for (const log of (data ?? []) as { metrics: Rec[] | null }[]) {
      for (const m of log.metrics ?? []) {
        if (m.name !== "sleep_analysis" || !Array.isArray(m.data)) continue;
        const isHours = ["hr", "hours"].includes(String(m.units ?? "min").toLowerCase());
        for (const p of m.data as Rec[]) {
          const total = Number(p.totalSleep ?? p.asleep ?? p.qty);
          const start = toIso(p.sleepStart ?? p.inBedStart);
          const end = toIso(p.sleepEnd ?? p.inBedEnd);
          if (isNaN(total) || total <= 0 || !start || !end) continue;
          const date = String(p.date).slice(0, 10);
          const day = byDate.get(date) ?? new Map();
          day.set(start, { min: isHours ? total * 60 : total, start, end });
          byDate.set(date, day);
        }
      }
    }
    if (!data || data.length < PAGE) break;
  }

  let updated = 0;
  let napDays = 0;
  for (const [date, sessions] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = [...sessions.values()].sort((a, b) => b.min - a.min);
    const night = sorted[0];
    const naps: Nap[] = sorted
      .slice(1)
      .filter((s) => s.min >= 10)
      .map((s) => ({ start: s.start, end: s.end, min: Math.round(s.min) }))
      .sort((a, b) => a.start.localeCompare(b.start));
    if (naps.length > 0) {
      napDays++;
      console.log(`${date} : ${naps.map((n) => `sieste ${n.min} min`).join(", ")}`);
    }
    if (DRY) continue;
    const { data, error } = await supabase
      .from("daily_metrics")
      .update({ sleep_start: night.start, sleep_end: night.end, naps: naps.length > 0 ? naps : null })
      .eq("date", date)
      .select("date");
    if (error) throw new Error(`${date} : ${error.message}`);
    if (data && data.length > 0) updated++;
  }
  console.log(`${byDate.size} jours avec sessions, ${napDays} avec siestes, ${DRY ? "simulation" : `${updated} lignes mises à jour`}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
