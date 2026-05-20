import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { computeRecoveryScore } from "@/lib/recovery-score";

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
          const h = extractHour(dateStr);
          // Fenêtre nocturne (00h–07h). Si h=-1 (pas d'heure, agrégat jour), on accepte.
          if (!isNaN(val) && val > 0 && (h < 0 || h < 7)) {
            getDay(date)._hrv_samples.push(r1(val));
          }
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
          const hR = extractHour(dateStr);
          if (!isNaN(val) && val > 0 && (hR < 0 || hR < 7)) {
            getDay(date)._respi_samples.push(r1(val));
          }
          break;
        }
        case "spo2": {
          const val = Number(point.qty);
          const hS = extractHour(dateStr);
          if (!isNaN(val) && val > 0 && (hS < 0 || hS < 7)) {
            getDay(date)._spo2_samples.push(r1(val));
          }
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

          if (rawTotal != null) {
            const totalMin = isHours ? rawTotal * 60 : rawTotal;
            day.sleep_total_min = Math.round(totalMin);

            const remRaw = Number(p.rem ?? p.sleepRem ?? p.sleepREM);
            const deepRaw = Number(p.deep ?? p.sleepDeep ?? p.sleepDeepSleep);
            const remMin = !isNaN(remRaw) && remRaw > 0 ? (isHours ? remRaw * 60 : remRaw) : null;
            const deepMin = !isNaN(deepRaw) && deepRaw > 0 ? (isHours ? deepRaw * 60 : deepRaw) : null;

            if (remMin != null && day.sleep_total_min > 0) {
              day.sleep_rem_pct = r1((remMin / day.sleep_total_min) * 100);
            }
            if (deepMin != null && day.sleep_total_min > 0) {
              day.sleep_deep_pct = r1((deepMin / day.sleep_total_min) * 100);
            }

            const awakeRaw = Number(p.awake ?? p.sleepAwake ?? p.sleepWake);
            const awakeMin = !isNaN(awakeRaw) && awakeRaw > 0 ? (isHours ? awakeRaw * 60 : awakeRaw) : null;
            if (awakeMin != null && day.sleep_total_min > 0) {
              day.sleep_awake_pct = r1((awakeMin / day.sleep_total_min) * 100);
            }
          }
          break;
        }
        case "steps": {
          const val = Number(point.qty);
          if (!isNaN(val) && val > 0) getDay(date).steps = (getDay(date).steps ?? 0) + Math.round(val);
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

  const supabase = createServiceClient();
  const results: string[] = [];

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
    if (day.daylight_min != null) day.daylight_min = Math.round(day.daylight_min);

    const hasData = Object.entries(day).some(([k, v]) => !k.startsWith("_") && v != null);
    if (!hasData) continue;

    // Récupérer l'historique 60j pour baseline recovery + outlier detection
    const sixtyDaysBefore = new Date(`${date}T12:00:00Z`);
    sixtyDaysBefore.setUTCDate(sixtyDaysBefore.getUTCDate() - 60);
    const windowStart60 = sixtyDaysBefore.toISOString().slice(0, 10);

    const { data: past } = await supabase
      .from("daily_metrics")
      .select("date, hrv_ms, resting_hr_bpm, respiratory_rate")
      .gte("date", windowStart60)
      .lt("date", date)
      .order("date", { ascending: false });

    const pastHrvValues = (past ?? []).map((r) => r.hrv_ms).filter((v): v is number => v != null);
    const pastHrValues = (past ?? []).map((r) => r.resting_hr_bpm).filter((v): v is number => v != null);

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

    // Baseline 60j pour le recovery score — médiane HRV (résiste aux pics)
    const hrvAvg = pastHrvValues.length > 0 ? median(pastHrvValues) : null;
    const hrAvg = pastHrValues.length > 0 ? pastHrValues.reduce((a, b) => a + b, 0) / pastHrValues.length : null;
    const respiValues = (past ?? []).map((r) => r.respiratory_rate).filter((v): v is number => v != null);
    const respiAvg = respiValues.length > 0 ? respiValues.reduce((a, b) => a + b, 0) / respiValues.length : null;

    const prevDayHr = (past ?? []).find((r) => r.resting_hr_bpm != null)?.resting_hr_bpm ?? null;
    const effectiveHr = day.resting_hr_bpm ?? prevDayHr;

    const recovery = computeRecoveryScore({
      hrvMs: day.hrv_ms,
      hrv7dAvgMs: hrvAvg,
      restingHrBpm: effectiveHr,
      restingHr7dAvgBpm: hrAvg,
      sleepTotalMin: day.sleep_total_min,
      sleepRemPct: day.sleep_rem_pct,
      sleepDeepPct: day.sleep_deep_pct,
      respiratoryRate: day.respiratory_rate,
      respiratoryRate7dAvg: respiAvg,
    });

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

    const startDate = new Date(startStr.replace(" ", "T").replace(/ ([+-])/, "$1"));
    const startedAt = startDate.toISOString();

    const name = String(wo.name ?? wo.activityType ?? "Unknown");
    const durationSec = Number(wo.duration);
    const durationMin = !isNaN(durationSec) ? Math.round(durationSec / 60) : null;

    let kcal: number | null = null;
    const aeObj = wo.activeEnergyBurned as Record<string, unknown> | undefined;
    if (aeObj?.qty != null) {
      const raw = Number(aeObj.qty);
      const units = String(aeObj.units ?? "kcal").toLowerCase();
      kcal = Math.round(units === "kj" ? raw / 4.184 : raw);
    } else if (wo.activeEnergy != null) {
      kcal = Math.round(Number(wo.activeEnergy));
    }

    const { error } = await supabase.from("workouts").upsert(
      {
        started_at: startedAt,
        type: name,
        duration_min: durationMin,
        kcal,
        source: "auto-export",
      },
      { onConflict: "started_at,type" },
    );
    if (!error) workoutCount++;
    else results.push(`workout ${name}: erreur ${error.message}`);
  }
  if (workoutCount > 0) results.push(`workouts: ${workoutCount} insérés`);

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
    raw_payload: payload,
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
