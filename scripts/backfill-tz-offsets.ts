// Rattrapage du fuseau des nuits et des séances (tz_offset_min) : celui du
// téléphone au premier envoi Health Auto Export conservé dans sync_logs
// (60 jours). Pour les jours plus anciens, le minuit local de la FC horaire.
// Les valeurs déjà renseignées ne sont pas touchées.
// Usage : npx tsx scripts/backfill-tz-offsets.ts [--dry]

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Charger .env.local manuellement (pas de dépendance dotenv)
for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf-8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}

const DRY = process.argv.includes("--dry");
// Client non typé pour lire les chemins JSON de sync_logs
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Rec = Record<string, unknown>;

// "2026-09-20 23:37:34 +0200" → 120
function offsetMin(s: unknown): number | null {
  const m = typeof s === "string" ? s.trim().match(/([+-])(\d{2}):?(\d{2})$/) : null;
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null;
}

// "2026-09-20 23:37:34 +0200" → ISO UTC
function toIso(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = Date.parse(s.trim().replace(" ", "T").replace(/ ?([+-]\d{2})(\d{2})$/, "$1:$2"));
  return isNaN(t) ? null : new Date(t).toISOString();
}

async function main() {
  // Premier envoi (le plus ancien) de chaque nuit et de chaque séance
  const nightOffset = new Map<string, number>();
  const workoutOffset = new Map<string, number>(); // clé : début ISO + type
  const PAGE = 50;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("sync_logs")
      .select("metrics:raw_payload->data->metrics, workouts:raw_payload->data->workouts")
      .not("raw_payload", "is", null)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`lecture sync_logs : ${error.message}`);
    for (const log of (data ?? []) as { metrics: Rec[] | null; workouts: Rec[] | null }[]) {
      for (const m of log.metrics ?? []) {
        if (m.name !== "sleep_analysis" || !Array.isArray(m.data)) continue;
        for (const p of m.data as Rec[]) {
          const date = String(p.date ?? "").slice(0, 10);
          const off = offsetMin(p.date);
          if (date && off != null && !nightOffset.has(date)) nightOffset.set(date, off);
        }
      }
      for (const w of log.workouts ?? []) {
        const iso = toIso(w.start);
        const off = offsetMin(w.start);
        const key = `${iso}|${String(w.name ?? "")}`;
        if (iso && off != null && !workoutOffset.has(key)) workoutOffset.set(key, off);
      }
    }
    if (!data || data.length < PAGE) break;
  }

  // ── Nuits ──
  const { data: days, error: daysError } = await supabase
    .from("daily_metrics")
    .select("date, tz_offset_min, hr_start:hr_hourly->>start")
    .is("tz_offset_min", null)
    .not("sleep_start", "is", null)
    .order("date", { ascending: true });
  if (daysError) throw new Error(`lecture daily_metrics : ${daysError.message}`);
  const dayCounts = new Map<number, number>();
  let daysDone = 0;
  for (const d of (days ?? []) as { date: string; hr_start: string | null }[]) {
    let off = nightOffset.get(d.date) ?? null;
    if (off == null && d.hr_start) off = Math.round((Date.parse(`${d.date}T00:00:00Z`) - Date.parse(d.hr_start)) / 60000);
    if (off == null || Math.abs(off) > 14 * 60) continue;
    dayCounts.set(off, (dayCounts.get(off) ?? 0) + 1);
    if (off !== 120) console.log(`nuit ${d.date} : ${off} min`);
    if (DRY) continue;
    const { error } = await supabase.from("daily_metrics").update({ tz_offset_min: off }).eq("date", d.date);
    if (error) throw new Error(`${d.date} : ${error.message}`);
    daysDone++;
  }

  // ── Séances ──
  const { data: workouts, error: woError } = await supabase
    .from("workouts")
    .select("id, started_at, type")
    .is("tz_offset_min", null)
    .gte("started_at", new Date(Date.now() - 70 * 86_400_000).toISOString());
  if (woError) throw new Error(`lecture workouts : ${woError.message}`);
  let woDone = 0;
  for (const w of (workouts ?? []) as { id: string; started_at: string; type: string | null }[]) {
    const off = workoutOffset.get(`${new Date(w.started_at).toISOString()}|${w.type ?? ""}`);
    if (off == null) continue;
    if (off !== 120) console.log(`séance ${w.started_at} ${w.type} : ${off} min`);
    woDone++;
    if (DRY) continue;
    const { error } = await supabase.from("workouts").update({ tz_offset_min: off }).eq("id", w.id);
    if (error) throw new Error(`${w.id} : ${error.message}`);
  }

  console.log(
    `nuits : ${[...dayCounts.entries()].map(([o, n]) => `${n} à ${o} min`).join(", ") || "aucune"} ; séances : ${woDone} ; ${
      DRY ? "simulation" : `${daysDone} nuits écrites`
    }`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
