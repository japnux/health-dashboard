import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { todayIso, isoDateMinusDays, localMidnightUtcIso } from "@/lib/dates";
import { getUserTz } from "@/lib/user-tz";
import { computeDayStrain } from "@/lib/strain-score";
import { loadBalanceSeries } from "@/lib/load-balance";
import { formSeries } from "@/lib/form";
import { BODY_METRICS, metricRange, metricStatus } from "@/lib/body-metrics";
import { heartRateRecoveryDrop, type RecoveryPoint } from "@/lib/workout-details";

async function isAuthenticated(): Promise<boolean> {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return false;
  const expected = createHash("sha256")
    .update(pw + "-hd-session")
    .digest("hex");
  const cookieStore = await cookies();
  return cookieStore.get("hd_session")?.value === expected;
}

function getWeekRange(offset: number, tz: string): { start: string; end: string; label: string } {
  const now = new Date(`${todayIso(tz)}T12:00:00Z`);
  const dow = now.getUTCDay();
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() - mondayOffset - offset * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);

  const start = monday.toISOString().slice(0, 10);
  const end = sunday.toISOString().slice(0, 10);

  if (offset === 0) return { start, end, label: "Cette semaine" };
  if (offset === 1) return { start, end, label: "La semaine dernière" };

  const fmt = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return { start, end, label: `${fmt(monday)}–${fmt(sunday)}` };
}

function getMonthRange(offset: number, tz: string): { start: string; end: string; label: string } {
  const now = new Date(`${todayIso(tz)}T12:00:00Z`);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));

  const start = d.toISOString().slice(0, 10);
  const end = last.toISOString().slice(0, 10);

  const monthName = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  if (offset === 0) return { start, end, label: "Ce mois" };
  return { start, end, label: monthName };
}

function getYearRange(offset: number, tz: string): { start: string; end: string; label: string } {
  const now = new Date(`${todayIso(tz)}T12:00:00Z`);
  const year = now.getUTCFullYear() - offset;

  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  if (offset === 0) return { start, end, label: "Cette année" };
  return { start, end, label: `${year}` };
}

function getPeriodRange(period: string, offset: number, tz: string) {
  switch (period) {
    case "week":
      return getWeekRange(offset, tz);
    case "year":
      return getYearRange(offset, tz);
    case "month":
    default:
      return getMonthRange(offset, tz);
  }
}

// Colonnes de daily_metrics utilisées par les statistiques
const METRIC_COLUMNS =
  "date, hrv_ms, sleeping_hr_bpm, respiratory_rate, spo2_pct, wrist_temp_c, sleep_total_min, sleep_rem_pct, sleep_deep_pct, sleep_awake_pct, sleep_start, sleep_end, steps, active_kcal, cardio_load, recovery_score";
const WORKOUT_COLUMNS =
  "id, started_at, type, duration_min, kcal, avg_hr_bpm, cardio_load, hr_zone_min, hr_recovery, distance_km, max_speed_kmh";

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "month";
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const supabase = createServiceClient();
  // Fuseau du téléphone : mêmes jours que les données reçues, même en voyage
  const tz = await getUserTz(supabase);
  const userToday = todayIso(tz);

  const current = getPeriodRange(period, offset, tz);
  const prev = getPeriodRange(period, offset + 1, tz);
  const workoutRange = (r: { start: string; end: string }) =>
    // Bornes à minuit heure locale (une séance après 22h l'été ne tombe pas sur la veille)
    [localMidnightUtcIso(r.start, tz), localMidnightUtcIso(isoDateMinusDays(r.end, -1), tz)] as const;

  try {
    const [metricsRes, workoutsRes, bodyRes, prevWorkoutsRes, configRes, loadRowsRes] = await Promise.all([
      // Période précédente + 60 jours avant, pour les plages habituelles
      // (même définition que l'accueil) et la comparaison
      supabase
        .from("daily_metrics")
        .select(METRIC_COLUMNS)
        .gte("date", isoDateMinusDays(prev.start, 60))
        .lte("date", current.end)
        .order("date", { ascending: true }),
      supabase
        .from("workouts")
        .select(WORKOUT_COLUMNS)
        .gte("started_at", workoutRange(current)[0])
        .lt("started_at", workoutRange(current)[1])
        .order("started_at", { ascending: true }),
      supabase
        .from("body_composition")
        .select("measured_at, weight_kg, body_fat_pct, lean_mass_kg")
        .gte("measured_at", current.start)
        .lte("measured_at", current.end)
        .order("measured_at", { ascending: true }),
      supabase
        .from("workouts")
        .select("started_at, type, duration_min, cardio_load")
        .gte("started_at", workoutRange(prev)[0])
        .lt("started_at", workoutRange(prev)[1]),
      supabase.from("dashboard_config").select("sleep_target_min").eq("id", 1).maybeSingle(),
      // Charge : un an d'historique pour les moyennes 7 j / 42 j
      supabase
        .from("daily_metrics")
        .select("date, cardio_load, active_kcal")
        .gte("date", isoDateMinusDays(prev.start, 365))
        .lte("date", current.end)
        .order("date", { ascending: true }),
    ]);
    if (metricsRes.error) throw metricsRes.error;

    const allMetrics = metricsRes.data ?? [];
    const inRange = (d: string, r: { start: string; end: string }) => d >= r.start && d <= r.end;

    // Strain de chaque jour, référence = les 30 jours précédents (comme l'accueil)
    const loadRows = loadRowsRes.data ?? [];
    const strainByDate: Record<string, number> = {};
    for (const row of loadRows) {
      if (row.date < prev.start) continue;
      const from = isoDateMinusDays(row.date, 30);
      const history = loadRows.filter((r) => r.date >= from && r.date < row.date);
      strainByDate[row.date] = computeDayStrain(row, history).score;
    }

    // Équilibre de charge et forme de chaque jour (lib/load-balance, lib/form)
    const lastDay = current.end < userToday ? current.end : userToday;
    const balance = loadBalanceSeries(
      loadRows.filter((r) => r.cardio_load != null),
      lastDay,
    );
    const formByDate = new Map(formSeries(balance).map((p) => [p.date, p.form]));
    const loadSeries = balance
      .filter((p) => p.date >= prev.start)
      .map((p) => ({
        date: p.date,
        load: p.measured ? Math.round(p.load) : null,
        ratio: p.ratio,
        form: formByDate.get(p.date) ?? null,
      }));

    // Mesures de la nuit : valeur et statut par rapport à la plage habituelle
    // (moyenne ± écart-type des 60 nuits précédentes), nuit par nuit
    const nightMetrics = BODY_METRICS.map((def) => {
      const rows = allMetrics
        .map((r) => ({ date: r.date as string, value: (r as Record<string, unknown>)[def.column] as number | null }))
        .filter((r): r is { date: string; value: number } => r.value != null);
      const points = rows
        .filter((r) => r.date >= prev.start)
        .map((r) => {
          const from = isoDateMinusDays(r.date, 60);
          const range = metricRange(
            rows.filter((p) => p.date >= from && p.date < r.date).map((p) => p.value),
            def.minHistory,
          );
          return {
            date: r.date,
            value: r.value,
            low: range?.low ?? null,
            high: range?.high ?? null,
            status: metricStatus(r.value, range, def.normalFrom),
          };
        });
      return { key: def.key, points };
    });

    const withRecovery = (w: { hr_recovery?: unknown }) =>
      heartRateRecoveryDrop(w.hr_recovery as RecoveryPoint[] | null)?.drop1 ?? null;

    return NextResponse.json({
      period,
      offset,
      tz,
      startDate: current.start,
      endDate: current.end,
      label: current.label,
      today: userToday,
      sleepTargetMin: configRes.data?.sleep_target_min ?? 450,
      strainByDate,
      loadSeries,
      nightMetrics,
      dailyMetrics: allMetrics.filter((r) => inRange(r.date, current)),
      workouts: (workoutsRes.data ?? []).map(({ hr_recovery, ...w }) => ({
        ...w,
        cardio_load: w.cardio_load != null ? Math.round(Number(w.cardio_load)) : null,
        hr_drop_1min: withRecovery({ hr_recovery }),
      })),
      bodyComposition: bodyRes.data ?? [],
      previousPeriod: {
        startDate: prev.start,
        endDate: prev.end,
        label: prev.label,
        dailyMetrics: allMetrics.filter((r) => inRange(r.date, prev)),
        workouts: prevWorkoutsRes.data ?? [],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("[stats] chargement échoué:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
