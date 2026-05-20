import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { todayIso } from "@/lib/dates";

async function isAuthenticated(): Promise<boolean> {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return false;
  const expected = createHash("sha256")
    .update(pw + "-hd-session")
    .digest("hex");
  const cookieStore = await cookies();
  return cookieStore.get("hd_session")?.value === expected;
}

function getWeekRange(offset: number): { start: string; end: string; label: string } {
  const now = new Date(`${todayIso()}T12:00:00Z`);
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

function getMonthRange(offset: number): { start: string; end: string; label: string } {
  const now = new Date(`${todayIso()}T12:00:00Z`);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));

  const start = d.toISOString().slice(0, 10);
  const end = last.toISOString().slice(0, 10);

  const monthName = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  if (offset === 0) return { start, end, label: "Ce mois" };
  return { start, end, label: monthName };
}

function getYearRange(offset: number): { start: string; end: string; label: string } {
  const now = new Date(`${todayIso()}T12:00:00Z`);
  const year = now.getUTCFullYear() - offset;

  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  if (offset === 0) return { start, end, label: "Cette année" };
  return { start, end, label: `${year}` };
}

function getPeriodRange(period: string, offset: number) {
  switch (period) {
    case "week":
      return getWeekRange(offset);
    case "year":
      return getYearRange(offset);
    case "month":
    default:
      return getMonthRange(offset);
  }
}

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "month";
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const current = getPeriodRange(period, offset);
  const prev = getPeriodRange(period, offset + 1);

  const supabase = createServiceClient();

  const [
    metricsRes,
    workoutsRes,
    bodyRes,
    prevMetricsRes,
    prevWorkoutsRes,
    journalRes,
    prevJournalRes,
  ] = await Promise.all([
    supabase
      .from("daily_metrics")
      .select(
        "date, hrv_ms, resting_hr_bpm, respiratory_rate, spo2_pct, sleep_total_min, sleep_rem_pct, sleep_deep_pct, sleep_awake_pct, steps, active_kcal, daylight_min, recovery_score, recovery_score_basis",
      )
      .gte("date", current.start)
      .lte("date", current.end)
      .order("date", { ascending: true }),

    supabase
      .from("workouts")
      .select("started_at, type, duration_min, kcal")
      .gte("started_at", `${current.start}T00:00:00`)
      .lte("started_at", `${current.end}T23:59:59`)
      .order("started_at", { ascending: true }),

    supabase
      .from("body_composition")
      .select("measured_at, weight_kg, body_fat_pct, lean_mass_kg")

      .gte("measured_at", current.start)
      .lte("measured_at", current.end)
      .order("measured_at", { ascending: true }),

    supabase
      .from("daily_metrics")
      .select(
        "date, hrv_ms, resting_hr_bpm, respiratory_rate, spo2_pct, sleep_total_min, sleep_rem_pct, sleep_deep_pct, sleep_awake_pct, steps, active_kcal, daylight_min, recovery_score",
      )
      .gte("date", prev.start)
      .lte("date", prev.end)
      .order("date", { ascending: true }),

    supabase
      .from("workouts")
      .select("started_at, type, duration_min, kcal")
      .gte("started_at", `${prev.start}T00:00:00`)
      .lte("started_at", `${prev.end}T23:59:59`),

    supabase
      .from("journal_entries")
      .select("date, mood, energy, stress, notes, gratitude")
      .gte("date", current.start)
      .lte("date", current.end)
      .order("date", { ascending: true }),

    supabase
      .from("journal_entries")
      .select("date, mood, energy, stress")
      .gte("date", prev.start)
      .lte("date", prev.end),
  ]);

  const journalEntries = journalRes.data ?? [];
  const prevJournalEntries = prevJournalRes.data ?? [];

  function journalAvg(entries: { mood: number | null; energy: number | null; stress: number | null }[], field: "mood" | "energy" | "stress") {
    const vals = entries.map((e) => e[field]).filter((v): v is number => v != null);
    if (vals.length === 0) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }

  const journalAverages = {
    mood: journalAvg(journalEntries, "mood"),
    energy: journalAvg(journalEntries, "energy"),
    stress: journalAvg(journalEntries, "stress"),
    entryCount: journalEntries.filter((e) => e.mood != null || e.energy != null || e.stress != null).length,
  };

  const prevJournalAverages = {
    mood: journalAvg(prevJournalEntries, "mood"),
    energy: journalAvg(prevJournalEntries, "energy"),
    stress: journalAvg(prevJournalEntries, "stress"),
  };

  return NextResponse.json({
    period,
    offset,
    startDate: current.start,
    endDate: current.end,
    label: current.label,
    dailyMetrics: metricsRes.data ?? [],
    workouts: workoutsRes.data ?? [],
    bodyComposition: bodyRes.data ?? [],
    journalEntries,
    journalAverages,
    previousPeriod: {
      startDate: prev.start,
      endDate: prev.end,
      label: prev.label,
      dailyMetrics: prevMetricsRes.data ?? [],
      workouts: prevWorkoutsRes.data ?? [],
      journalAverages: prevJournalAverages,
    },
  });
}
