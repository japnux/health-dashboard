import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { recoveryForDay } from "@/lib/recovery-score";
import { extractWorkoutDetails, stripRoutesForLog } from "@/lib/workout-details";
import {
  getHrMax,
  localMidnightUtc,
  recomputeDailyLoad,
  sleepingHrFromHourly,
  workoutLoad,
  type HrHourly,
} from "@/lib/cardio-load";

function isAuthorized(request: Request): boolean {
  const key = process.env.AUTO_EXPORT_API_KEY;
  if (!key) return false;
  return request.headers.get("x-api-key") === key;
}

function extractDate(dateStr: string): string {
  return dateStr.slice(0, 10);
}

function extractHour(dateStr: string): number {
  const m = dateStr.match(/(\d{2}):\d{2}:\d{2}/);
  return m ? parseInt(m[1], 10) : -1;
}

// Date de la nuit pour les mesures nocturnes : Health Auto Export date la
// température du poignet et les troubles respiratoires au soir du coucher
// ("2026-09-20 23:00" pour la nuit du 20 au 21). Le sommeil et la HRV de
// cette nuit sont rangés au jour du réveil : un échantillon daté de l'après-midi
// ou du soir est donc reporté au lendemain.
function nightDate(dateStr: string): string {
  const date = extractDate(dateStr);
  const h = extractHour(dateStr);
  if (h < 12) return date;
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// "2026-09-19 23:50:38 +0200" → ISO 8601 ("2026-09-19T23:50:38+02:00").
// Retourne null si la date est absente ou illisible.
function toIso(dateStr: unknown): string | null {
  if (typeof dateStr !== "string" || !dateStr) return null;
  const normalized = dateStr
    .trim()
    .replace(" ", "T")
    .replace(/ ?([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const METRIC_KEYS: Record<string, string> = {
  heart_rate_variability: "hrv",
  heart_rate_variability_sdnn: "hrv",
  hrv: "hrv",
  resting_heart_rate: "resting_hr",
  resting_heart_rate_bpm: "resting_hr",
  sleep_analysis: "sleep",
  step_count: "steps",
  steps: "steps",
  active_energy: "active_kcal",
  active_energy_burned: "active_kcal",
  active_energy_kcal: "active_kcal",
  time_in_daylight: "daylight",
  hrv_sdnn: "hrv",
  body_mass: "weight",
  weight_body_mass: "weight",
  weight: "weight",
  body_fat_percentage: "body_fat",
  lean_body_mass: "lean_mass",
  respiratory_rate: "respiratory_rate",
  blood_oxygen_saturation: "spo2",
  oxygen_saturation: "spo2",
  spo2: "spo2",
  // Cardio journalier
  walking_heart_rate_average: "walking_hr",
  heart_rate: "heart_rate",
  // Nuit. Noms Health Auto Export relevés dans du code tiers, à confirmer sur
  // un vrai envoi : les alias couvrent les variantes plausibles.
  apple_sleeping_wrist_temperature: "wrist_temp",
  sleeping_wrist_temperature: "wrist_temp",
  breathing_disturbances: "breathing",
  apple_sleeping_breathing_disturbances: "breathing",
  sleeping_breathing_disturbances: "breathing",
  // Forme de fond
  vo2_max: "vo2max",
  cardio_recovery: "cardio_recovery",
  heart_rate_recovery_one_minute: "cardio_recovery",
};

type DayBucket = {
  hrv_ms: number | null;
  _hrv_samples: number[]; // nocturnes (00h–07h) → médiane
  resting_hr_bpm: number | null;
  _resting_hr_samples: number[]; // nocturnes → médiane
  respiratory_rate: number | null;
  _respi_samples: number[]; // nocturnes → médiane
  spo2_pct: number | null;
  _spo2_samples: number[]; // nocturnes → médiane
  sleep_total_min: number | null;
  sleep_rem_pct: number | null;
  sleep_deep_pct: number | null;
  sleep_awake_pct: number | null;
  steps: number | null;
  active_kcal: number | null;
  daylight_min: number | null;
  sleep_start: string | null;
  sleep_end: string | null;
  walking_hr_avg_bpm: number | null;
  hr_max_bpm: number | null;
  hr_min_bpm: number | null;
  wrist_temp_c: number | null;
  breathing_disturbances: number | null;
  vo2_max: number | null;
  cardio_recovery_bpm: number | null;
  hr_hourly: HrHourly | null; // FC moyenne horaire, pour la charge cardio hors séance
  sleeping_hr_bpm: number | null; // plus basse moyenne horaire pendant le sommeil
};

type BodyCompBucket = {
  weight_kg: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
};

function emptyDay(): DayBucket {
  return {
    hrv_ms: null,
    _hrv_samples: [],
    resting_hr_bpm: null,
    _resting_hr_samples: [],
    respiratory_rate: null,
    _respi_samples: [],
    spo2_pct: null,
    _spo2_samples: [],
    sleep_total_min: null,
    sleep_rem_pct: null,
    sleep_deep_pct: null,
    sleep_awake_pct: null,
    steps: null,
    active_kcal: null,
    daylight_min: null,
    sleep_start: null,
    sleep_end: null,
    walking_hr_avg_bpm: null,
    hr_max_bpm: null,
    hr_min_bpm: null,
    wrist_temp_c: null,
    breathing_disturbances: null,
    vo2_max: null,
    cardio_recovery_bpm: null,
    hr_hourly: null,
    sleeping_hr_bpm: null,
  };
}

function r1(n: number) {
  return Math.round(n * 10) / 10;
}
function r2(n: number) {
  return Math.round(n * 100) / 100;
}

// Médiane d'un tableau de nombres (pour détection outliers)
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const root = (payload as Record<string, unknown>).data ?? payload;
  const rawMetrics = (root as Record<string, unknown>).metrics;
  const rawWorkouts = (root as Record<string, unknown>).workouts;
  const metrics: unknown[] = Array.isArray(rawMetrics) ? rawMetrics : [];
  const workouts: unknown[] = Array.isArray(rawWorkouts) ? rawWorkouts : [];

  const days = new Map<string, DayBucket>();
  const bodyComp = new Map<string, BodyCompBucket>();

  function getDay(date: string): DayBucket {
    if (!days.has(date)) days.set(date, emptyDay());
    return days.get(date)!;
  }
  function getBody(date: string): BodyCompBucket {
    if (!bodyComp.has(date))
      bodyComp.set(date, { weight_kg: null, body_fat_pct: null, lean_mass_kg: null });
    return bodyComp.get(date)!;
  }

  // Sessions de sommeil secondaires ignorées (siestes), reportées dans le log
  const skippedSleep: string[] = [];
  // HRV, respiration et SpO2 : rattachées à la nuit après lecture du sommeil
  const nightSamples: { kind: "hrv" | "respi" | "spo2"; dateStr: string; v: number }[] = [];
  // FC moyenne horaire avec son instant de début, pour la FC de sommeil
  const hourlyHr: { t: number; avg: number }[] = [];

  for (const m of metrics) {
    const metric = m as Record<string, unknown>;
    const name = String(metric.name ?? "").toLowerCase().replace(/[\s-]/g, "_");
    const key = METRIC_KEYS[name];
    if (!key) continue;

    const dataPoints = Array.isArray(metric.data) ? metric.data : [];

    for (const pt of dataPoints) {
      const point = pt as Record<string, unknown>;
      const dateStr = String(point.date ?? "");
      if (!dateStr) continue;
      const date = extractDate(dateStr);

      switch (key) {
        case "hrv": {
          const val = Number(point.qty);
          if (!isNaN(val) && val > 0) nightSamples.push({ kind: "hrv", dateStr, v: r1(val) });
          break;
        }
        case "resting_hr": {
          const val = Number(point.qty);
          const hHr = extractHour(dateStr);
          if (!isNaN(val) && val > 0 && (hHr < 0 || hHr < 7)) {
            getDay(date)._resting_hr_samples.push(Math.round(val));
          }
          break;
        }
        case "respiratory_rate": {
          const val = Number(point.qty);
          if (!isNaN(val) && val > 0) nightSamples.push({ kind: "respi", dateStr, v: r1(val) });
          break;
        }
        case "spo2": {
          const val = Number(point.qty);
          if (!isNaN(val) && val > 0) nightSamples.push({ kind: "spo2", dateStr, v: r1(val) });
          break;
        }
        case "sleep": {
          const day = getDay(date);
          const p = point as Record<string, unknown>;
          const units = String(metric.units ?? "min").toLowerCase();
          const isHours = units === "hr" || units === "hours";

          const totalSleep = Number(p.totalSleep);
          const asleep = Number(p.asleep);
          const qty = Number(p.qty);
          const rawTotal =
            !isNaN(totalSleep) && totalSleep > 0
              ? totalSleep
              : !isNaN(asleep) && asleep > 0
                ? asleep
                : !isNaN(qty) && qty > 0
                  ? qty
                  : null;

          // Plusieurs sessions le même jour (sieste) : la plus longue est la
          // nuit ; une plus courte ne l'écrase pas, elle est signalée
          if (rawTotal != null && day.sleep_total_min != null) {
            const newMin = isHours ? rawTotal * 60 : rawTotal;
            if (newMin <= day.sleep_total_min) {
              skippedSleep.push(`sommeil ${date}: session de ${Math.round(newMin)} min ignorée (nuit de ${day.sleep_total_min} min conservée)`);
              break;
            }
          }

          if (rawTotal != null) {
            // Les pourcentages se calculent sur le total exact, pas sur le total
            // arrondi à la minute (REM 32,2 % au lieu de 32,3 % sinon)
            const totalMin = isHours ? rawTotal * 60 : rawTotal;
            day.sleep_total_min = Math.round(totalMin);

            const remRaw = Number(p.rem ?? p.sleepRem ?? p.sleepREM);
            const deepRaw = Number(p.deep ?? p.sleepDeep ?? p.sleepDeepSleep);
            const remMin = !isNaN(remRaw) && remRaw > 0 ? (isHours ? remRaw * 60 : remRaw) : null;
            const deepMin = !isNaN(deepRaw) && deepRaw > 0 ? (isHours ? deepRaw * 60 : deepRaw) : null;

            if (remMin != null && totalMin > 0) {
              day.sleep_rem_pct = r1((remMin / totalMin) * 100);
            }
            if (deepMin != null && totalMin > 0) {
              day.sleep_deep_pct = r1((deepMin / totalMin) * 100);
            }

            const awakeRaw = Number(p.awake ?? p.sleepAwake ?? p.sleepWake);
            const awakeMin = !isNaN(awakeRaw) && awakeRaw > 0 ? (isHours ? awakeRaw * 60 : awakeRaw) : null;
            if (awakeMin != null && totalMin > 0) {
              day.sleep_awake_pct = r1((awakeMin / totalMin) * 100);
            }

            // Heures de coucher / lever pour la régularité du sommeil
            day.sleep_start = toIso(p.sleepStart ?? p.inBedStart);
            day.sleep_end = toIso(p.sleepEnd ?? p.inBedEnd);
          }
          break;
        }
        case "walking_hr": {
          const val = Number(point.qty);
          if (!isNaN(val) && val > 0) getDay(date).walking_hr_avg_bpm = Math.round(val);
          break;
        }
        case "heart_rate": {
          // Points horaires { Avg, Max, Min } : on garde les extrêmes du jour
          const max = Number(point.Max);
          const min = Number(point.Min);
          const day = getDay(date);
          if (!isNaN(max) && max > 0) {
            day.hr_max_bpm = Math.max(day.hr_max_bpm ?? 0, Math.round(max));
          }
          if (!isNaN(min) && min > 0) {
            day.hr_min_bpm = Math.min(day.hr_min_bpm ?? Infinity, Math.round(min));
          }
          // Moyenne horaire, indexée par heure locale depuis minuit local
          const avg = Number(point.Avg);
          const hour = extractHour(dateStr);
          const start = localMidnightUtc(dateStr);
          if (!isNaN(avg) && avg > 0 && hour >= 0 && hour < 24 && start) {
            if (!day.hr_hourly) day.hr_hourly = { start, avg: Array(24).fill(null) };
            day.hr_hourly.avg[hour] = r1(avg);
          }
          const hourStartIso = toIso(dateStr);
          if (!isNaN(avg) && avg > 0 && hourStartIso) hourlyHr.push({ t: Date.parse(hourStartIso), avg });
          break;
        }
        case "wrist_temp": {
          const val = Number(point.qty);
          if (!isNaN(val) && val > 0) {
            const units = String(metric.units ?? "degC").toLowerCase();
            const celsius = units.includes("f") ? (val - 32) / 1.8 : val;
            getDay(nightDate(dateStr)).wrist_temp_c = r2(celsius);
          }
          break;
        }
        case "breathing": {
          const val = Number(point.qty);
          if (!isNaN(val) && val >= 0) getDay(nightDate(dateStr)).breathing_disturbances = r1(val);
          break;
        }
        case "vo2max": {
          const val = Number(point.qty);
          if (!isNaN(val) && val > 0) getDay(date).vo2_max = r1(val);
          break;
        }
        case "cardio_recovery": {
          const val = Number(point.qty);
          if (!isNaN(val) && val > 0) getDay(date).cardio_recovery_bpm = Math.round(val);
          break;
        }
        case "steps": {
          const val = Number(point.qty);
          if (!isNaN(val) && val > 0) getDay(date).steps = (getDay(date).steps ?? 0) + val;
          break;
        }
        case "active_kcal": {
          const val = Number(point.qty);
          if (!isNaN(val) && val > 0) {
            const units = String(metric.units ?? "kcal").toLowerCase();
            const kcal = units === "kj" ? val / 4.184 : val;
            getDay(date).active_kcal = (getDay(date).active_kcal ?? 0) + kcal;
          }
          break;
        }
        case "daylight": {
          const val = Number(point.qty);
          if (!isNaN(val) && val > 0) {
            const units = String(metric.units ?? "min").toLowerCase();
            const mins = units === "hr" ? val * 60 : val;
            getDay(date).daylight_min = (getDay(date).daylight_min ?? 0) + mins;
          }
          break;
        }
        case "weight": {
          const val = Number(point.qty);
          if (!isNaN(val)) {
            const units = String(metric.units ?? "kg").toLowerCase();
            getBody(date).weight_kg = r2(units === "lb" ? val * 0.453592 : val);
          }
          break;
        }
        case "body_fat": {
          let val = Number(point.qty);
          if (!isNaN(val)) {
            if (val < 1) val *= 100;
            getBody(date).body_fat_pct = r1(val);
          }
          break;
        }
        case "lean_mass": {
          const val = Number(point.qty);
          if (!isNaN(val)) {
            const units = String(metric.units ?? "kg").toLowerCase();
            getBody(date).lean_mass_kg = r2(units === "lb" ? val * 0.453592 : val);
          }
          break;
        }
      }
    }
  }

  // Fenêtre de sommeil réelle (coucher → lever) de chaque nuit reçue. Une mesure
  // prise dans cette fenêtre compte pour la nuit, même datée de la veille au
  // soir (23:50). Sans fenêtre connue pour ce jour, repli sur 00h–07h.
  const sleepWindows = [...days.entries()]
    .filter(([, d]) => d.sleep_start && d.sleep_end)
    .map(([date, d]) => ({ date, start: Date.parse(d.sleep_start!), end: Date.parse(d.sleep_end!) }));
  // FC de sommeil de chaque nuit reçue (base du score de récupération)
  for (const w of sleepWindows) {
    const sleepingHr = sleepingHrFromHourly(w.start, w.end, hourlyHr);
    if (sleepingHr != null) getDay(w.date).sleeping_hr_bpm = sleepingHr;
  }

  for (const sample of nightSamples) {
    const iso = toIso(sample.dateStr);
    const t = iso ? Date.parse(iso) : NaN;
    const win = !isNaN(t) ? sleepWindows.find((w) => t >= w.start && t <= w.end) : undefined;
    let target: string | null = win?.date ?? null;
    if (!target) {
      const date = extractDate(sample.dateStr);
      const h = extractHour(sample.dateStr);
      const hasWindow = sleepWindows.some((w) => w.date === date);
      if (!hasWindow && (h < 0 || h < 7)) target = date;
    }
    if (!target) continue;
    const day = getDay(target);
    if (sample.kind === "hrv") day._hrv_samples.push(sample.v);
    else if (sample.kind === "respi") day._respi_samples.push(sample.v);
    else day._spo2_samples.push(sample.v);
  }

  const supabase = createServiceClient();
  const results: string[] = [...skippedSleep];
  // FC max de référence pour la charge cardio (séances et fond)
  const hrMax = await getHrMax(supabase);
  // Jours dont la charge cardio doit être recalculée en fin de traitement
  const loadDates = new Set<string>();

  // ── daily_metrics avec recovery score ──
  for (const [date, day] of days) {
    // Résoudre les samples nocturnes → médiane
    if (day._hrv_samples.length > 0) {
      day.hrv_ms = r1(median(day._hrv_samples));
      if (day._hrv_samples.length > 1) {
        const min = r1(Math.min(...day._hrv_samples));
        const max = r1(Math.max(...day._hrv_samples));
        results.push(`HRV ${date}: médiane de ${day._hrv_samples.length} mesures (${min}–${max} ms) → ${day.hrv_ms} ms`);
      }
    }
    if (day._resting_hr_samples.length > 0) {
      day.resting_hr_bpm = Math.round(median(day._resting_hr_samples));
    }
    if (day._respi_samples.length > 0) {
      day.respiratory_rate = r1(median(day._respi_samples));
    }
    if (day._spo2_samples.length > 0) {
      day.spo2_pct = r1(median(day._spo2_samples));
    }
    // Arrondir les cumuls horaires
    if (day.active_kcal != null) day.active_kcal = Math.round(day.active_kcal);
    if (day.steps != null) day.steps = Math.round(day.steps);
    if (day.daylight_min != null) day.daylight_min = Math.round(day.daylight_min);

    const hasData = Object.entries(day).some(([k, v]) => !k.startsWith("_") && v != null);
    if (!hasData) continue;

    // Récupérer l'historique 60j pour baseline recovery + outlier detection
    const sixtyDaysBefore = new Date(`${date}T12:00:00Z`);
    sixtyDaysBefore.setUTCDate(sixtyDaysBefore.getUTCDate() - 60);
    const windowStart60 = sixtyDaysBefore.toISOString().slice(0, 10);

    const { data: past } = await supabase
      .from("daily_metrics")
      .select("date, hrv_ms, resting_hr_bpm, sleeping_hr_bpm, respiratory_rate")
      .gte("date", windowStart60)
      .lt("date", date)
      .order("date", { ascending: false });


    // Détection d'outliers via médiane 14j
    const past14 = (past ?? []).slice(0, 14);
    const hrv14 = past14.map((r) => r.hrv_ms).filter((v): v is number => v != null);
    const hr14 = past14.map((r) => r.resting_hr_bpm).filter((v): v is number => v != null);
    if (day.hrv_ms != null && hrv14.length >= 3) {
      const medianHrv = median(hrv14);
      if (day.hrv_ms > medianHrv * 2.5 || day.hrv_ms < medianHrv * 0.3) {
        results.push(`⚠️ HRV ${date}: ${day.hrv_ms} ms rejeté (médiane 14j = ${r1(medianHrv)} ms)`);
        day.hrv_ms = null;
      }
    }
    if (day.resting_hr_bpm != null && hr14.length >= 3) {
      const medianHr = median(hr14);
      if (Math.abs(day.resting_hr_bpm - medianHr) > 25) {
        results.push(`⚠️ FC repos ${date}: ${day.resting_hr_bpm} bpm rejeté (médiane 14j = ${Math.round(medianHr)} bpm)`);
        day.resting_hr_bpm = null;
      }
    }

    // Le score se calcule sur la journée complète : un envoi peut ne contenir
    // qu'une partie des données d'un jour (ex. seulement la température de la
    // nuit). On complète donc avec ce qui est déjà en base, sinon le score
    // serait recalculé sur des données partielles et écraserait le bon.
    const { data: existing, error: existingError } = await supabase
      .from("daily_metrics")
      .select("hrv_ms, resting_hr_bpm, sleeping_hr_bpm, respiratory_rate, sleep_total_min, sleep_rem_pct, sleep_deep_pct")
      .eq("date", date)
      .maybeSingle();
    if (existingError) {
      results.push(`daily_metrics ${date}: erreur lecture existant ${existingError.message}`);
      continue;
    }

    // Mesures du jour uniquement (envoi, sinon ligne existante). Avant, la FC
    // repos manquante était remplacée par la dernière connue sur 60 jours :
    // un jour sans aucune mesure pouvait sortir à 9/10.
    const recovery = recoveryForDay(
      {
        hrv_ms: day.hrv_ms ?? existing?.hrv_ms ?? null,
        resting_hr_bpm: day.resting_hr_bpm ?? existing?.resting_hr_bpm ?? null,
        sleeping_hr_bpm: day.sleeping_hr_bpm ?? existing?.sleeping_hr_bpm ?? null,
        respiratory_rate: day.respiratory_rate ?? existing?.respiratory_rate ?? null,
        sleep_total_min: day.sleep_total_min ?? existing?.sleep_total_min ?? null,
        sleep_rem_pct: day.sleep_rem_pct ?? existing?.sleep_rem_pct ?? null,
        sleep_deep_pct: day.sleep_deep_pct ?? existing?.sleep_deep_pct ?? null,
      },
      past ?? [],
    );

    // Ne pas écraser les champs existants avec null :
    // on ne passe que les champs non-null du day bucket dans l'upsert
    const dayFields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(day)) {
      if (k.startsWith("_")) continue; // champs internes (_hrv_samples)
      if (v != null) dayFields[k] = v;
    }

    const { error } = await supabase.from("daily_metrics").upsert(
      {
        date,
        ...dayFields,
        recovery_score: recovery.score,
        recovery_score_basis: recovery.basis,
        raw_payload: payload as Record<string, unknown>,
      },
      { onConflict: "date" },
    );
    if (error) {
      results.push(`daily_metrics ${date}: erreur ${error.message}`);
    } else {
      results.push(`daily_metrics ${date}: ok (recovery ${recovery.score ?? "n/a"}/10)`);
      if (day.hr_hourly) loadDates.add(date);
    }
  }

  // ── body_composition ──
  for (const [date, bc] of bodyComp) {
    if (bc.weight_kg == null && bc.body_fat_pct == null && bc.lean_mass_kg == null) continue;

    if (bc.weight_kg == null) continue;

    let fatPct = bc.body_fat_pct;
    if (fatPct == null && bc.weight_kg > 0 && bc.lean_mass_kg != null && bc.lean_mass_kg > 0) {
      fatPct = r1((1 - bc.lean_mass_kg / bc.weight_kg) * 100);
    }

    const { error } = await supabase
      .from("body_composition")
      .upsert(
        {
          measured_at: date,
          weight_kg: bc.weight_kg,
          body_fat_pct: fatPct,
          lean_mass_kg: bc.lean_mass_kg,
        },
        { onConflict: "measured_at" },
      );
    if (error) {
      results.push(`body_composition ${date}: erreur ${error.message}`);
    } else {
      results.push(`body_composition ${date}: ok`);
    }
  }

  // ── workouts ──
  let workoutCount = 0;
  for (const w of workouts) {
    const wo = w as Record<string, unknown>;
    const startStr = String(wo.start ?? "");
    if (!startStr) continue;

    const startedAt = toIso(startStr);
    if (!startedAt) {
      results.push(`workout ignoré : date de début illisible "${startStr}"`);
      continue;
    }

    const name = String(wo.name ?? wo.activityType ?? "Unknown");
    const durationSec = Number(wo.duration);
    const durationMin = !isNaN(durationSec) ? Math.round(durationSec / 60) : null;

    let kcal: number | null = null;
    const aeObj = wo.activeEnergyBurned as Record<string, unknown> | undefined;
    if (aeObj?.qty != null) {
      const raw = Number(aeObj.qty);
      const units = String(aeObj.units ?? "kcal").toLowerCase();
      kcal = Math.round(units === "kj" ? raw / 4.184 : raw);
    } else if (Array.isArray(wo.activeEnergy)) {
      // Points minute par minute ({ qty, units }) : somme convertie en kcal
      let total = 0;
      for (const pt of wo.activeEnergy as Record<string, unknown>[]) {
        const q = Number(pt.qty);
        if (isNaN(q)) continue;
        total += String(pt.units ?? "kcal").toLowerCase() === "kj" ? q / 4.184 : q;
      }
      if (total > 0) kcal = Math.round(total);
    }

    // FC de la séance. Health Auto Export renvoie parfois une séance sans ses
    // données FC : on n'inclut ces champs que s'ils sont présents, pour ne pas
    // effacer des valeurs déjà enregistrées.
    const hrFields: Record<string, unknown> = {};
    const hrObj = wo.heartRate as Record<string, Record<string, unknown>> | undefined;
    const avgHr = Number((wo.avgHeartRate as Record<string, unknown> | undefined)?.qty ?? hrObj?.avg?.qty);
    const maxHr = Number((wo.maxHeartRate as Record<string, unknown> | undefined)?.qty ?? hrObj?.max?.qty);
    if (!isNaN(avgHr) && avgHr > 0) hrFields.avg_hr_bpm = Math.round(avgHr);
    if (!isNaN(maxHr) && maxHr > 0) hrFields.max_hr_bpm = Math.round(maxHr);
    const hrData = Array.isArray(wo.heartRateData) ? wo.heartRateData : [];
    const wLoad = workoutLoad(hrData, hrMax);
    if (wLoad) {
      hrFields.cardio_load = wLoad.load;
      hrFields.hr_zone_min = wLoad.zoneMin;
    }

    const { error } = await supabase.from("workouts").upsert(
      {
        started_at: startedAt,
        type: name,
        duration_min: durationMin,
        kcal,
        source: "auto-export",
        ...hrFields,
      },
      { onConflict: "started_at,type" },
    );
    if (!error) {
      workoutCount++;
      if (wLoad) loadDates.add(extractDate(startStr));
      // Détails (courbe FC, récupération, tracé GPS) : écrits à part pour qu'un
      // souci sur ces colonnes n'empêche jamais d'enregistrer la séance
      const details = extractWorkoutDetails(wo);
      if (Object.keys(details).length > 0) {
        const { error: detailsError } = await supabase
          .from("workouts")
          .update(details)
          .eq("started_at", startedAt)
          .eq("type", name);
        if (detailsError) results.push(`workout ${name} détails: erreur ${detailsError.message}`);
      }
    } else results.push(`workout ${name}: erreur ${error.message}`);
  }
  if (workoutCount > 0) results.push(`workouts: ${workoutCount} insérés`);

  // ── Charge cardio des jours touchés (FC horaire + séances en base) ──
  for (const date of loadDates) {
    const line = await recomputeDailyLoad(supabase, date, hrMax);
    if (line) results.push(line);
  }

  const hasErrors = results.some((r) => r.includes("erreur"));
  const status = days.size === 0 && workoutCount === 0 ? "empty" : hasErrors ? "partial" : "ok";
  const metricsFound = metrics.map((m) => String((m as Record<string, unknown>).name ?? "")).filter(Boolean);
  const summary =
    status === "empty"
      ? `Aucune donnée exploitable. Métriques reçues : ${metricsFound.join(", ") || "aucune"}`
      : `${days.size} jour(s), ${workoutCount} workout(s)${hasErrors ? " (avec erreurs)" : ""}`;

  const logRow: Record<string, unknown> = {
    source: "auto-export",
    status,
    summary,
    days_processed: days.size,
    workouts_processed: workoutCount,
    details: results,
    // Sans les tracés GPS bruts (plusieurs Mo par envoi)
    raw_payload: stripRoutesForLog(payload),
    http_headers: {
      "automation-name": request.headers.get("automation-name") ?? "",
      "automation-id": request.headers.get("automation-id") ?? "",
      "automation-aggregation": request.headers.get("automation-aggregation") ?? "",
      "automation-period": request.headers.get("automation-period") ?? "",
      "content-type": request.headers.get("content-type") ?? "",
    },
  };
  await supabase.from("sync_logs").insert(
    logRow as import("@/lib/types").Database["public"]["Tables"]["sync_logs"]["Insert"],
  );

  return NextResponse.json({
    ok: status !== "empty",
    status,
    processed: {
      days: days.size,
      bodyComp: bodyComp.size,
      workouts: workoutCount,
    },
    details: results,
  });
}
