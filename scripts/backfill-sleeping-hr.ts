// Rattrapage de la FC de sommeil à partir des envois Health Auto Export
// stockés dans sync_logs (fenêtre de sommeil + FC horaire), puis recalcul
// des scores avec scripts/recompute-recovery.ts.
// Usage : npx tsx scripts/backfill-sleeping-hr.ts [--dry]

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { Database } from "@/lib/types";
import { sleepingHrFromHourly } from "@/lib/cardio-load";

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

// "2026-09-20 11:00:00 +0200" → instant en ms
function toMs(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const t = Date.parse(s.trim().replace(" ", "T").replace(/ ?([+-]\d{2})(\d{2})$/, "$1:$2"));
  return isNaN(t) ? null : t;
}

async function main() {
  const windows = new Map<string, { start: number; end: number }>();
  const hourly = new Map<number, number>(); // début d'heure → moyenne (la plus récente l'emporte)
  const PAGE = 100;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await rawClient
      .from("sync_logs")
      .select("metrics:raw_payload->data->metrics")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`lecture sync_logs : ${error.message}`);
    for (const log of (data ?? []) as { metrics: Rec[] | null }[]) {
      for (const m of log.metrics ?? []) {
        if (!Array.isArray(m.data)) continue;
        if (m.name === "sleep_analysis") {
          for (const p of m.data as Rec[]) {
            const start = toMs(p.sleepStart ?? p.inBedStart);
            const end = toMs(p.sleepEnd ?? p.inBedEnd);
            if (start != null && end != null && end > start) {
              windows.set(String(p.date).slice(0, 10), { start, end });
            }
          }
        } else if (m.name === "heart_rate") {
          for (const p of m.data as Rec[]) {
            const t = toMs(p.date);
            const avg = Number(p.Avg);
            if (t != null && !isNaN(avg) && avg > 0) hourly.set(t, avg);
          }
        }
      }
    }
    if (!data || data.length < PAGE) break;
  }

  const hourlyList = [...hourly.entries()].map(([t, avg]) => ({ t, avg }));
  const values = new Map<string, number>();
  for (const [date, w] of windows) {
    const v = sleepingHrFromHourly(w.start, w.end, hourlyList);
    if (v != null) values.set(date, v);
  }
  console.log(`${windows.size} nuits avec fenêtre de sommeil, ${values.size} avec une FC de sommeil`);
  if (DRY) {
    console.log("Simulation : aucune écriture.", [...values].slice(-5));
    return;
  }

  let updated = 0;
  for (const [date, v] of values) {
    const { data, error } = await supabase
      .from("daily_metrics")
      .update({ sleeping_hr_bpm: v })
      .eq("date", date)
      .select("date");
    if (error) throw new Error(`${date} : ${error.message}`);
    if (data && data.length > 0) updated++;
  }
  console.log(`${updated} jours mis à jour. Lance ensuite scripts/recompute-recovery.ts.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
