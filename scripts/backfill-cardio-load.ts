// Rattrapage de la charge cardio à partir des envois Health Auto Export
// stockés dans sync_logs : FC horaire par jour, FC et charge par séance, puis
// charge totale de chaque jour.
// Usage : npx tsx scripts/backfill-cardio-load.ts [--dry]

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { Database } from "@/lib/types";
import {
  getHrMax,
  localMidnightUtc,
  recomputeDailyLoad,
  workoutLoad,
  type HrHourly,
} from "@/lib/cardio-load";

// Charger .env.local manuellement (pas de dépendance dotenv)
for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf-8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}

const DRY = process.argv.includes("--dry");
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
// Client non typé pour lire les chemins JSON de sync_logs (le client typé
// ne sait pas inférer ces sélections et fait échouer tsc).
const rawClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

type Rec = Record<string, unknown>;

// "2026-09-20 11:31:11 +0200" → ISO UTC (même conversion que l'import)
function toIso(s: string): string | null {
  const d = new Date(s.trim().replace(" ", "T").replace(/ ?([+-]\d{2})(\d{2})$/, "$1:$2"));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function fetchLogs(): Promise<{ workouts: Rec[] | null; metrics: Rec[] | null }[]> {
  const all: { workouts: Rec[] | null; metrics: Rec[] | null }[] = [];
  const PAGE = 100;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await rawClient
      .from("sync_logs")
      .select("created_at, workouts:raw_payload->data->workouts, metrics:raw_payload->data->metrics")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`lecture sync_logs : ${error.message}`);
    all.push(...((data ?? []) as unknown as { workouts: Rec[] | null; metrics: Rec[] | null }[]));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

async function main() {
  const logs = await fetchLogs();
  console.log(`${logs.length} envois lus${DRY ? " (simulation, aucune écriture)" : ""}`);

  // Ordre chronologique : la version la plus récente de chaque donnée l'emporte
  const hourly = new Map<string, HrHourly>();
  const workouts = new Map<string, Rec>(); // clé = début UTC + type, comme en base
  let payloadMaxHr = 0;

  for (const log of logs) {
    for (const m of log.metrics ?? []) {
      if (m.name !== "heart_rate" || !Array.isArray(m.data)) continue;
      for (const p of m.data as Rec[]) {
        const dateStr = String(p.date ?? "");
        const avg = Number(p.Avg);
        const hour = Number(dateStr.slice(11, 13));
        const start = localMidnightUtc(dateStr);
        if (!start || isNaN(avg) || avg <= 0 || isNaN(hour)) continue;
        const date = dateStr.slice(0, 10);
        const day = hourly.get(date);
        if (!day || day.start !== start) {
          hourly.set(date, { start, avg: day?.start === start ? day.avg : Array(24).fill(null) });
        }
        hourly.get(date)!.avg[hour] = Math.round(avg * 10) / 10;
      }
    }
    for (const w of log.workouts ?? []) {
      const hr = w.heartRateData;
      if (!Array.isArray(hr) || hr.length === 0) continue;
      const startIso = toIso(String(w.start ?? ""));
      if (!startIso) continue;
      workouts.set(`${startIso}|${String(w.name ?? w.activityType ?? "Unknown")}`, w);
      const max = Number((w.maxHeartRate as Rec | undefined)?.qty);
      if (!isNaN(max)) payloadMaxHr = Math.max(payloadMaxHr, max);
    }
  }

  const hrMax = Math.max(await getHrMax(supabase), Math.round(payloadMaxHr));
  console.log(`FC max de référence : ${hrMax} bpm`);
  console.log(`${hourly.size} jours avec FC horaire, ${workouts.size} séances avec FC minute par minute`);

  // 1. Séances : FC moyenne/max, charge, zones
  let wOk = 0;
  let wMissing = 0;
  for (const [key, w] of workouts) {
    const [startIso, type] = key.split("|");
    const load = workoutLoad(w.heartRateData as unknown[], hrMax);
    const avg = Number((w.avgHeartRate as Rec | undefined)?.qty);
    const max = Number((w.maxHeartRate as Rec | undefined)?.qty);
    const fields = {
      ...(isNaN(avg) ? {} : { avg_hr_bpm: Math.round(avg) }),
      ...(isNaN(max) ? {} : { max_hr_bpm: Math.round(max) }),
      ...(load ? { cardio_load: load.load, hr_zone_min: load.zoneMin } : {}),
    };
    if (DRY) {
      wOk++;
      continue;
    }
    const { data, error } = await supabase
      .from("workouts")
      .update(fields)
      .eq("started_at", startIso)
      .eq("type", type)
      .select("id");
    if (error) throw new Error(`séance ${key} : ${error.message}`);
    if (data && data.length > 0) wOk++;
    else wMissing++;
  }
  console.log(`séances mises à jour : ${wOk}${wMissing ? `, absentes de la base : ${wMissing}` : ""}`);

  // 2. FC horaire par jour (seulement sur les jours déjà présents)
  let hOk = 0;
  if (!DRY) {
    for (const [date, hr] of hourly) {
      const { data, error } = await supabase
        .from("daily_metrics")
        .update({ hr_hourly: hr })
        .eq("date", date)
        .select("date");
      if (error) throw new Error(`hr_hourly ${date} : ${error.message}`);
      if (data && data.length > 0) hOk++;
    }
  }
  console.log(`jours avec FC horaire enregistrée : ${DRY ? hourly.size : hOk}`);

  // 3. Charge totale de chaque jour
  if (!DRY) {
    const dates = [...hourly.keys()].sort();
    for (const date of dates) {
      const line = await recomputeDailyLoad(supabase, date, hrMax);
      if (line?.includes("erreur")) console.error(line);
    }
    console.log(`charge recalculée sur ${dates.length} jours (${dates[0]} → ${dates[dates.length - 1]})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
