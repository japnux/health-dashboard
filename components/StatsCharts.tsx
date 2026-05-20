"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";
import {
  fillMissingDays,
  computeMovingAverage,
  shortDateLabel,
} from "@/lib/stats-data";
import { formatWorkoutType } from "@/lib/workout-recommendation";
import { AiCorrelations } from "@/components/AiCorrelations";
import { computeStrainScore } from "@/lib/strain-score";
import { computeJournalImpact } from "@/lib/journal-impact";

// ── Types ────────────────────────────────────────────────────────────────

type Period = "week" | "month" | "year";

type DailyMetric = {
  date: string;
  hrv_ms: number | null;
  resting_hr_bpm: number | null;
  respiratory_rate: number | null;
  spo2_pct: number | null;
  sleep_total_min: number | null;
  sleep_rem_pct: number | null;
  sleep_deep_pct: number | null;
  sleep_awake_pct: number | null;
  steps: number | null;
  active_kcal: number | null;
  daylight_min: number | null;
  recovery_score: number | null;
  recovery_score_basis: string | null;
};

type Workout = {
  started_at: string;
  type: string;
  duration_min: number | null;
  kcal: number | null;
};

type BodyComp = {
  measured_at: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
};

type PrevPeriodMetric = {
  date: string;
  hrv_ms: number | null;
  resting_hr_bpm: number | null;
  respiratory_rate: number | null;
  spo2_pct: number | null;
  sleep_total_min: number | null;
  sleep_rem_pct: number | null;
  sleep_deep_pct: number | null;
  sleep_awake_pct: number | null;
  steps: number | null;
  active_kcal: number | null;
  daylight_min: number | null;
  recovery_score: number | null;
};

type JournalEntry = {
  date: string;
  mood: number | null;
  energy: number | null;
  stress: number | null;
  notes: string | null;
  gratitude: string | null;
};

type JournalAverages = {
  mood: number | null;
  energy: number | null;
  stress: number | null;
  entryCount?: number;
};

type StatsPayload = {
  period: string;
  offset: number;
  startDate: string;
  endDate: string;
  label: string;
  dailyMetrics: DailyMetric[];
  workouts: Workout[];
  bodyComposition: BodyComp[];
  journalEntries?: JournalEntry[];
  journalAverages?: JournalAverages;
  previousPeriod: {
    startDate: string;
    endDate: string;
    label: string;
    dailyMetrics: PrevPeriodMetric[];
    workouts: Workout[];
    journalAverages?: JournalAverages;
  };
};

// ── Couleurs ─────────────────────────────────────────────────────────────

const C = {
  green: "#15be53",
  yellow: "#eab308",
  red: "#ea2261",
  blue: "#533afd",
  purple: "#533afd",
  orange: "#f97316",
  cyan: "#06b6d4",
  zinc400: "#64748d",
  zinc600: "#273951",
  zinc700: "#061b31",
  zinc800: "#0d1520",
};

// ── Tabs de contenu ─────────────────────────────────────────────────────

type StatsTab = "resume" | "correlations" | "recovery" | "sommeil" | "activite" | "corps" | "journal";

const STATS_TABS: { key: StatsTab; label: string; icon: string }[] = [
  { key: "resume", label: "Résumé", icon: "📊" },
  { key: "correlations", label: "Corrélations", icon: "🔗" },
  { key: "recovery", label: "Recovery", icon: "❤️" },
  { key: "sommeil", label: "Sommeil", icon: "🌙" },
  { key: "activite", label: "Activité", icon: "🏃" },
  { key: "corps", label: "Corps", icon: "⚖️" },
  { key: "journal", label: "Journal", icon: "📝" },
];

// ── Mini-analyses par tab ───────────────────────────────────────────────

function tabMiniAnalysis(tab: StatsTab, data: StatsPayload, period: Period): string | null {
  const m = data.dailyMetrics;
  const pm = data.previousPeriod.dailyMetrics;

  switch (tab) {
    case "resume":
    case "correlations":
      return null;

    case "recovery": {
      const vals = m.map((d) => d.recovery_score).filter((v): v is number => v != null);
      if (vals.length === 0) return "Pas de données recovery sur cette période.";
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const prevVals = pm.map((d) => d.recovery_score).filter((v): v is number => v != null);
      const prevAvg = prevVals.length > 0 ? prevVals.reduce((a, b) => a + b, 0) / prevVals.length : null;
      const trend = prevAvg != null ? (avg > prevAvg + 0.3 ? " — en hausse" : avg < prevAvg - 0.3 ? " — en baisse" : " — stable") : "";
      const hrvVals = m.map((d) => d.hrv_ms).filter((v): v is number => v != null);
      const avgHrv = hrvVals.length > 0 ? Math.round(hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length) : null;
      const respiVals = m.map((d) => d.respiratory_rate).filter((v): v is number => v != null);
      const avgRespi = respiVals.length > 0 ? Math.round(respiVals.reduce((a, b) => a + b, 0) / respiVals.length * 10) / 10 : null;
      let text = `Recovery moy. ${avg.toFixed(1)}/10${trend}.`;
      if (avgHrv != null) text += ` HRV moy. ${avgHrv} ms.`;
      if (avgRespi != null) text += ` Respi moy. ${avgRespi}/min.`;
      return text;
    }

    case "sommeil": {
      const vals = m.map((d) => d.sleep_total_min).filter((v): v is number => v != null);
      if (vals.length === 0) return "Pas de données sommeil sur cette période.";
      const avgH = (vals.reduce((a, b) => a + b, 0) / vals.length) / 60;
      const deepVals = m.map((d) => d.sleep_deep_pct).filter((v): v is number => v != null);
      const avgDeep = deepVals.length > 0 ? Math.round(deepVals.reduce((a, b) => a + b, 0) / deepVals.length) : null;
      const daylightVals = m.map((d) => d.daylight_min).filter((v): v is number => v != null);
      const avgDaylight = daylightVals.length > 0 ? Math.round(daylightVals.reduce((a, b) => a + b, 0) / daylightVals.length) : null;
      const spo2Vals = m.map((d) => d.spo2_pct).filter((v): v is number => v != null);
      const avgSpo2 = spo2Vals.length > 0 ? Math.round(spo2Vals.reduce((a, b) => a + b, 0) / spo2Vals.length * 10) / 10 : null;
      const awakeVals = m.map((d) => d.sleep_awake_pct).filter((v): v is number => v != null);
      const avgAwake = awakeVals.length > 0 ? Math.round(awakeVals.reduce((a, b) => a + b, 0) / awakeVals.length) : null;
      let text = `Moyenne ${avgH.toFixed(1)}h/nuit.`;
      if (avgDeep != null) text += ` ${avgDeep}% profond.`;
      if (avgAwake != null) text += ` ${avgAwake}% éveillé.`;
      if (avgSpo2 != null) text += ` SpO₂ moy. ${avgSpo2}%.`;
      if (avgDaylight != null) text += ` ${Math.round(avgDaylight / 60 * 10) / 10}h de lumière/jour.`;
      return text;
    }

    case "activite": {
      const stepsVals = m.map((d) => d.steps).filter((v): v is number => v != null);
      const avgStepsVal = stepsVals.length > 0 ? Math.round(stepsVals.reduce((a, b) => a + b, 0) / stepsVals.length) : null;
      const nbWorkouts = data.workouts.length;
      const daysInPeriod = period === "week" ? 7 : period === "month" ? 30 : 365;
      const freqPerWeek = nbWorkouts > 0 ? Math.round((nbWorkouts / daysInPeriod) * 7 * 10) / 10 : 0;
      const kcalVals = m.map((d) => d.active_kcal).filter((v): v is number => v != null);
      const avgKcal = kcalVals.length > 0 ? Math.round(kcalVals.reduce((a, b) => a + b, 0) / kcalVals.length) : null;
      const strainData = computeDailyStrain(m, pm);
      const strainAvg = strainData.length > 0 ? Math.round((strainData.reduce((s, d) => s + d.strain, 0) / strainData.length) * 10) / 10 : null;
      let text = avgStepsVal != null ? `${avgStepsVal.toLocaleString("fr-FR")} pas/jour.` : "";
      if (nbWorkouts > 0) text += ` ${nbWorkouts} séances (${freqPerWeek}/sem).`;
      if (avgKcal != null) text += ` ${avgKcal} kcal actives/jour.`;
      if (strainAvg != null) text += ` Strain moy. ${strainAvg}/10.`;
      return text || "Pas de données d'activité.";
    }

    case "corps": {
      if (data.bodyComposition.length === 0) return "Pas de pesée sur cette période.";
      const first = data.bodyComposition[0];
      const last = data.bodyComposition[data.bodyComposition.length - 1];
      if (first.weight_kg != null && last.weight_kg != null && data.bodyComposition.length > 1) {
        const diff = last.weight_kg - first.weight_kg;
        const sign = diff > 0 ? "+" : "";
        return `${data.bodyComposition.length} pesées. ${sign}${diff.toFixed(1)} kg sur la période (${first.weight_kg} → ${last.weight_kg} kg).`;
      }
      return `${data.bodyComposition.length} pesée${data.bodyComposition.length > 1 ? "s" : ""}. Dernier poids : ${last.weight_kg} kg.`;
    }

    case "journal": {
      const avg = data.journalAverages;
      if (!avg || (avg.entryCount ?? 0) === 0) return "Aucune entrée journal sur cette période.";
      const parts: string[] = [`${avg.entryCount} entrées.`];
      if (avg.mood != null) parts.push(`Humeur moy. ${avg.mood.toFixed(1)}/5.`);
      if (avg.stress != null) parts.push(`Stress moy. ${avg.stress.toFixed(1)}/5.`);
      return parts.join(" ");
    }
  }
}

// ── Composant principal ──────────────────────────────────────────────────

export function StatsCharts() {
  const [period, setPeriod] = useState<Period>("month");
  const [offset, setOffset] = useState(0);
  const [activeTab, setActiveTab] = useState<StatsTab>("resume");
  const [data, setData] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (p: Period, o: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stats?period=${p}&offset=${o}`);
      if (!res.ok) throw new Error("Fetch stats failed");
      const json: StatsPayload = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(period, offset);
  }, [period, offset, fetchData]);

  function handlePeriodChange(p: Period) {
    setPeriod(p);
    setOffset(0);
  }

  const periodTabs: { key: Period; label: string }[] = [
    { key: "week", label: "Semaine" },
    { key: "month", label: "Mois" },
    { key: "year", label: "Année" },
  ];

  const visibleTabs = STATS_TABS.filter((t) => {
    if (!data) return true;
    if (t.key === "corps" && data.bodyComposition.length === 0) return false;
    if (t.key === "journal" && (data.journalAverages?.entryCount ?? 0) === 0 && !(data.journalEntries && data.journalEntries.length > 0)) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Sélecteur de période */}
      <div className="space-y-3">
        <div className="flex gap-1 bg-[var(--color-border)]/50 dark:bg-white/5 rounded-[var(--radius-md)] p-1 w-fit">
          {periodTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => handlePeriodChange(t.key)}
              className={`rounded-[var(--radius-sm)] px-4 py-1.5 text-sm font-normal transition-colors ${
                period === t.key
                  ? "bg-white dark:bg-white/10 text-[var(--color-heading)] dark:text-white"
                  : "text-[var(--color-body)] hover:text-[var(--color-heading)] dark:hover:text-white"
              }`}
              style={period === t.key ? { boxShadow: "var(--shadow-ambient)" } : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOffset((o) => o + 1)}
            className="rounded-[var(--radius-sm)] px-2 py-1 text-sm text-[var(--color-body)] hover:bg-[var(--color-border)]/50 dark:hover:bg-white/5 transition-colors"
          >
            ←
          </button>
          <button
            onClick={() => setOffset(0)}
            className={`text-sm font-normal ${offset === 0 ? "text-[var(--color-brand-purple)]" : "text-[var(--color-heading)] dark:text-white hover:text-[var(--color-brand-purple)]"}`}
          >
            {data?.label ?? "…"}
          </button>
          <button
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={offset === 0}
            className="rounded-[var(--radius-sm)] px-2 py-1 text-sm text-[var(--color-body)] hover:bg-[var(--color-border)]/50 dark:hover:bg-white/5 transition-colors disabled:opacity-30"
          >
            →
          </button>
          {data?.previousPeriod.label && (
            <span className="text-xs text-[var(--color-body)] uppercase">
              vs. {data.previousPeriod.label}
            </span>
          )}
        </div>
      </div>

      {/* Tabs de contenu */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-normal whitespace-nowrap transition-colors ${
              activeTab === t.key
                ? "bg-[var(--color-brand-purple)] text-white"
                : "text-[var(--color-body)] hover:bg-[var(--color-border)]/50 dark:hover:bg-white/5"
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center text-sm text-zinc-500 py-12">
          Chargement…
        </div>
      )}

      {!loading && data && (
        <div className="space-y-5">
          {/* Mini-analyse */}
          {activeTab !== "resume" && (() => {
            const analysis = tabMiniAnalysis(activeTab, data, period);
            if (!analysis) return null;
            return (
              <div className="rounded-[var(--radius-md)] bg-[var(--color-brand-purple)]/5 border border-[var(--color-brand-purple)]/10 px-4 py-3">
                <p className="text-sm text-[var(--color-heading)] dark:text-white/90">{analysis}</p>
              </div>
            );
          })()}

          {/* Contenu par tab */}
          {activeTab === "resume" && (
            <PeriodSummary data={data} period={period} offset={offset} />
          )}

          {activeTab === "correlations" && (
            <AiCorrelations />
          )}

          {activeTab === "recovery" && (
            <>
              <RecoveryChart
                metrics={data.dailyMetrics}
                previousMetrics={data.previousPeriod.dailyMetrics}
                startDate={data.startDate}
                endDate={data.endDate}
                period={period}
              />
              <HrvChart
                metrics={data.dailyMetrics}
                previousMetrics={data.previousPeriod.dailyMetrics}
                startDate={data.startDate}
                endDate={data.endDate}
                period={period}
              />
              <RespiratoryChart
                metrics={data.dailyMetrics}
                previousMetrics={data.previousPeriod.dailyMetrics}
                startDate={data.startDate}
                endDate={data.endDate}
                period={period}
              />
            </>
          )}

          {activeTab === "sommeil" && (
            <>
              <SleepChart
                metrics={data.dailyMetrics}
                startDate={data.startDate}
                endDate={data.endDate}
                period={period}
              />
              <DaylightChart
                metrics={data.dailyMetrics}
                startDate={data.startDate}
                endDate={data.endDate}
                period={period}
              />
              <SpO2Chart
                metrics={data.dailyMetrics}
                startDate={data.startDate}
                endDate={data.endDate}
                period={period}
              />
            </>
          )}

          {activeTab === "activite" && (
            <>
              {data.workouts.length > 0 && (
                <WorkoutsSummary workouts={data.workouts} />
              )}
              <StrainChart
                metrics={data.dailyMetrics}
                prevMetrics={data.previousPeriod.dailyMetrics}
                startDate={data.startDate}
                endDate={data.endDate}
                period={period}
              />
              <ActivityChart
                metrics={data.dailyMetrics}
                startDate={data.startDate}
                endDate={data.endDate}
                period={period}
              />
            </>
          )}

          {activeTab === "corps" && data.bodyComposition.length > 0 && (
            <WeightChart bodyComposition={data.bodyComposition} />
          )}

          {activeTab === "journal" && (
            <>
              <JournalStatsSection
                entries={data.journalEntries ?? []}
                averages={data.journalAverages ?? { mood: null, energy: null, stress: null, entryCount: 0 }}
                prevAverages={data.previousPeriod.journalAverages}
              />
              <JournalImpactSection
                journalEntries={data.journalEntries ?? []}
                dailyMetrics={data.dailyMetrics}
              />
            </>
          )}
        </div>
      )}

      {!loading && !data && (
        <div className="text-center text-sm text-zinc-500 py-12">
          Erreur de chargement.
        </div>
      )}
    </div>
  );
}

// ── Chart wrapper ────────────────────────────────────────────────────────

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-4 sm:p-5"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <h2 className="text-xs font-normal uppercase tracking-wide text-[var(--color-body)] mb-4">
        {title}
      </h2>
      {children}
    </section>
  );
}

// ── Nombre de ticks adapté à la période ──────────────────────────────────

function tickInterval(period: Period): number {
  switch (period) {
    case "week":
      return 0; // tous les jours
    case "month":
      return 4; // ~1 tick tous les 5 jours
    case "year":
      return 29; // ~1 tick par mois
  }
}

// ── Recovery Score ───────────────────────────────────────────────────────

function RecoveryChart({
  metrics,
  previousMetrics,
  startDate,
  endDate,
  period,
}: {
  metrics: DailyMetric[];
  previousMetrics?: PrevPeriodMetric[];
  startDate: string;
  endDate: string;
  period: Period;
}) {
  const filled = fillMissingDays(
    metrics.map((m) => ({
      date: m.date,
      value: m.recovery_score,
    })),
    startDate,
    endDate,
  );

  const prevValues = previousMetrics?.map((m) => m.recovery_score) ?? [];

  const chartData = filled.map((d, i) => ({
    label: shortDateLabel(d.date),
    date: d.date,
    score: d.value ?? null,
    prev: prevValues[i] ?? null,
  }));

  return (
    <ChartCard title="Score de récupération">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-zinc-200, #e4e4e7)"
            opacity={0.5}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: C.zinc400 }}
            interval={tickInterval(period)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 10]}
            ticks={[0, 2.5, 5, 7.5, 10]}
            tick={{ fontSize: 11, fill: C.zinc400 }}
            axisLine={false}
            tickLine={false}
            width={30}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: C.zinc800,
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 12,
            }}
            formatter={(val) => [`${val}/10`, "Score"]}
          />
          {/* Zones colorées de référence */}
          <ReferenceLine y={7.5} stroke={C.green} strokeDasharray="4 4" strokeOpacity={0.5} />
          <ReferenceLine y={5} stroke={C.yellow} strokeDasharray="4 4" strokeOpacity={0.5} />
          <ReferenceLine y={2.5} stroke={C.red} strokeDasharray="4 4" strokeOpacity={0.5} />
          {prevValues.length > 0 && (
            <Line
              type="monotone"
              dataKey="prev"
              stroke={C.zinc400}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeOpacity={0.4}
              dot={false}
              connectNulls={false}
            />
          )}
          <Line
            type="monotone"
            dataKey="score"
            stroke={C.blue}
            strokeWidth={2}
            dot={{ r: period === "week" ? 4 : 0 }}
            activeDot={{ r: 5, fill: C.blue }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── HRV ──────────────────────────────────────────────────────────────────

function HrvChart({
  metrics,
  previousMetrics,
  startDate,
  endDate,
  period,
}: {
  metrics: DailyMetric[];
  previousMetrics?: PrevPeriodMetric[];
  startDate: string;
  endDate: string;
  period: Period;
}) {
  const filled = fillMissingDays(
    metrics.map((m) => ({ date: m.date, value: m.hrv_ms })),
    startDate,
    endDate,
  );

  const prevValues = previousMetrics?.map((m) => m.hrv_ms) ?? [];
  const withAvg = computeMovingAverage(filled, 7);

  const chartData = withAvg.map((d, i) => ({
    label: shortDateLabel(d.date),
    hrv: d.value,
    avg7: d.avg,
    prev: prevValues[i] ?? null,
  }));

  return (
    <ChartCard title="HRV (ms)">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="hrvGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={C.purple} stopOpacity={0.3} />
              <stop offset="95%" stopColor={C.purple} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-zinc-200, #e4e4e7)"
            opacity={0.5}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: C.zinc400 }}
            interval={tickInterval(period)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: C.zinc400 }}
            axisLine={false}
            tickLine={false}
            width={35}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: C.zinc800,
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 12,
            }}
            formatter={(val, name) => [
              `${Math.round(val as number)} ms`,
              name === "hrv" ? "HRV" : "Moy. 7j",
            ]}
          />
          {prevValues.length > 0 && (
            <Line
              type="monotone"
              dataKey="prev"
              stroke={C.zinc400}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeOpacity={0.4}
              dot={false}
              connectNulls={false}
            />
          )}
          <Area
            type="monotone"
            dataKey="hrv"
            stroke={C.purple}
            fill="url(#hrvGrad)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="avg7"
            stroke={C.orange}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Fréq. respiratoire ──────────────────────────────────────────────────

function RespiratoryChart({
  metrics,
  previousMetrics,
  startDate,
  endDate,
  period,
}: {
  metrics: DailyMetric[];
  previousMetrics?: PrevPeriodMetric[];
  startDate: string;
  endDate: string;
  period: Period;
}) {
  const filled = fillMissingDays(
    metrics.map((m) => ({ date: m.date, value: m.respiratory_rate })),
    startDate,
    endDate,
  );

  if (filled.every((d) => d.value == null)) return null;

  const prevValues = previousMetrics?.map((m) => m.respiratory_rate) ?? [];
  const withAvg = computeMovingAverage(filled, 7);

  const chartData = withAvg.map((d, i) => ({
    label: shortDateLabel(d.date),
    respi: d.value,
    avg7: d.avg,
    prev: prevValues[i] ?? null,
  }));

  return (
    <ChartCard title="Fréq. respiratoire (/min)">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="respiGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={C.cyan} stopOpacity={0.3} />
              <stop offset="95%" stopColor={C.cyan} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-zinc-200, #e4e4e7)" opacity={0.5} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: C.zinc400 }}
            interval={tickInterval(period)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: C.zinc400 }}
            axisLine={false}
            tickLine={false}
            width={35}
            domain={["dataMin - 1", "dataMax + 1"]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: C.zinc800,
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 12,
            }}
            formatter={(val, name) => [
              `${Math.round((val as number) * 10) / 10} /min`,
              name === "respi" ? "Respi" : name === "avg7" ? "Moy. 7j" : "Préc.",
            ]}
          />
          {prevValues.length > 0 && (
            <Line
              type="monotone"
              dataKey="prev"
              stroke={C.zinc400}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeOpacity={0.4}
              dot={false}
              connectNulls={false}
            />
          )}
          <Area
            type="monotone"
            dataKey="respi"
            stroke={C.cyan}
            fill="url(#respiGrad)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="avg7"
            stroke={C.orange}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Sommeil ──────────────────────────────────────────────────────────────

function SleepChart({
  metrics,
  startDate,
  endDate,
  period,
}: {
  metrics: DailyMetric[];
  startDate: string;
  endDate: string;
  period: Period;
}) {
  const filled = fillMissingDays(metrics, startDate, endDate);

  const chartData = filled.map((d) => {
    const total = d.sleep_total_min ?? 0;
    const remPct = d.sleep_rem_pct ?? 0;
    const deepPct = d.sleep_deep_pct ?? 0;
    const awakePct = d.sleep_awake_pct ?? 0;
    const lightPct = Math.max(0, 100 - remPct - deepPct - awakePct);

    const totalH = total / 60;
    return {
      label: shortDateLabel(d.date),
      deep: total > 0 ? Math.round((deepPct / 100) * totalH * 10) / 10 : null,
      rem: total > 0 ? Math.round((remPct / 100) * totalH * 10) / 10 : null,
      light: total > 0 ? Math.round((lightPct / 100) * totalH * 10) / 10 : null,
      awake: total > 0 && awakePct > 0 ? Math.round((awakePct / 100) * totalH * 10) / 10 : null,
    };
  });

  return (
    <ChartCard title="Sommeil (heures)">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-zinc-200, #e4e4e7)"
            opacity={0.5}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: C.zinc400 }}
            interval={tickInterval(period)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: C.zinc400 }}
            axisLine={false}
            tickLine={false}
            width={30}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: C.zinc800,
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 12,
            }}
            formatter={(val, name) => {
              const labels: Record<string, string> = {
                deep: "Profond",
                rem: "REM",
                light: "Léger",
                awake: "Éveillé",
              };
              return [`${val}h`, labels[name as string] ?? name];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value: string) => {
              const labels: Record<string, string> = {
                deep: "Profond",
                rem: "REM",
                light: "Léger",
                awake: "Éveillé",
              };
              return labels[value] ?? value;
            }}
          />
          <ReferenceLine
            y={7.5}
            stroke={C.green}
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            label={{ value: "7h30", position: "right", fontSize: 10, fill: C.zinc400 }}
          />
          <Bar dataKey="deep" stackId="sleep" fill={C.blue} radius={[0, 0, 0, 0]} />
          <Bar dataKey="rem" stackId="sleep" fill={C.cyan} radius={[0, 0, 0, 0]} />
          <Bar dataKey="light" stackId="sleep" fill="#94a3b8" radius={[0, 0, 0, 0]} />
          <Bar dataKey="awake" stackId="sleep" fill="#f97316" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Lumière du jour ─────────────────────────────────────────────────────

function DaylightChart({
  metrics,
  startDate,
  endDate,
  period,
}: {
  metrics: DailyMetric[];
  startDate: string;
  endDate: string;
  period: Period;
}) {
  const filled = fillMissingDays(
    metrics.map((m) => ({ date: m.date, value: m.daylight_min })),
    startDate,
    endDate,
  );

  if (filled.every((d) => d.value == null)) return null;

  const chartData = filled.map((d) => ({
    label: shortDateLabel(d.date),
    daylight: d.value != null && d.value > 0 ? Math.round((d.value / 60) * 10) / 10 : null,
  }));

  return (
    <ChartCard title="Lumière du jour (heures)">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-zinc-200, #e4e4e7)"
            opacity={0.5}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: C.zinc400 }}
            interval={tickInterval(period)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: C.zinc400 }}
            axisLine={false}
            tickLine={false}
            width={30}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: C.zinc800,
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 12,
            }}
            formatter={(val) => [`${val}h`, "Lumière"]}
          />
          <Bar dataKey="daylight" fill="#facc15" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── SpO2 ────────────────────────────────────────────────────────────────

function SpO2Chart({
  metrics,
  startDate,
  endDate,
  period,
}: {
  metrics: DailyMetric[];
  startDate: string;
  endDate: string;
  period: Period;
}) {
  const filled = fillMissingDays(
    metrics.map((m) => ({ date: m.date, value: m.spo2_pct })),
    startDate,
    endDate,
  );

  if (filled.every((d) => d.value == null)) return null;

  const withAvg = computeMovingAverage(filled, 7);

  const chartData = withAvg.map((d) => ({
    label: shortDateLabel(d.date),
    spo2: d.value,
    avg7: d.avg,
  }));

  return (
    <ChartCard title="SpO₂ (%)">
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="spo2Grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={C.blue} stopOpacity={0.25} />
              <stop offset="95%" stopColor={C.blue} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-zinc-200, #e4e4e7)" opacity={0.5} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: C.zinc400 }}
            interval={tickInterval(period)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: C.zinc400 }}
            axisLine={false}
            tickLine={false}
            width={35}
            domain={[92, 100]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: C.zinc800,
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 12,
            }}
            formatter={(val, name) => [
              `${Math.round((val as number) * 10) / 10}%`,
              name === "spo2" ? "SpO₂" : "Moy. 7j",
            ]}
          />
          <ReferenceLine
            y={94}
            stroke={C.red}
            strokeDasharray="4 3"
            strokeOpacity={0.5}
            label={{
              value: "94%",
              position: "right",
              fill: C.red,
              fontSize: 9,
            }}
          />
          <Area
            type="monotone"
            dataKey="spo2"
            stroke={C.blue}
            fill="url(#spo2Grad)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="avg7"
            stroke={C.orange}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Activité (pas) ───────────────────────────────────────────────────────

function ActivityChart({
  metrics,
  startDate,
  endDate,
  period,
}: {
  metrics: DailyMetric[];
  startDate: string;
  endDate: string;
  period: Period;
}) {
  const filled = fillMissingDays(
    metrics.map((m) => ({ date: m.date, steps: m.steps })),
    startDate,
    endDate,
  );

  const chartData = filled.map((d) => ({
    label: shortDateLabel(d.date),
    steps: d.steps ?? null,
  }));

  return (
    <ChartCard title="Pas / jour">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-zinc-200, #e4e4e7)"
            opacity={0.5}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: C.zinc400 }}
            interval={tickInterval(period)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: C.zinc400 }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
            }
          />
          <Tooltip
            contentStyle={{
              backgroundColor: C.zinc800,
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 12,
            }}
            formatter={(val) => [
              (val as number).toLocaleString("fr-FR"),
              "Pas",
            ]}
          />
          <ReferenceLine
            y={10000}
            stroke={C.green}
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            label={{ value: "10k", position: "right", fontSize: 10, fill: C.zinc400 }}
          />
          <Bar dataKey="steps" fill={C.orange} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Strain ──────────────────────────────────────────────────────────────

function StrainChart({
  metrics,
  prevMetrics,
  startDate,
  endDate,
  period,
}: {
  metrics: DailyMetric[];
  prevMetrics: PrevPeriodMetric[];
  startDate: string;
  endDate: string;
  period: Period;
}) {
  const dailyStrain = computeDailyStrain(metrics, prevMetrics);
  const filled = fillMissingDays(
    dailyStrain.map((d) => ({ date: d.date, value: d.strain })),
    startDate,
    endDate,
  );

  const chartData = filled.map((d) => ({
    label: shortDateLabel(d.date),
    strain: d.value ?? null,
  }));

  return (
    <ChartCard title="Strain quotidien">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-zinc-200, #e4e4e7)"
            opacity={0.5}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: C.zinc400 }}
            interval={tickInterval(period)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 10]}
            ticks={[0, 3, 6, 8, 10]}
            tick={{ fontSize: 11, fill: C.zinc400 }}
            axisLine={false}
            tickLine={false}
            width={30}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: C.zinc800,
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 12,
            }}
            formatter={(val) => [`${val}/10`, "Strain"]}
          />
          <ReferenceLine y={6} stroke={C.orange} strokeDasharray="4 4" strokeOpacity={0.5} />
          <ReferenceLine y={3} stroke={C.green} strokeDasharray="4 4" strokeOpacity={0.5} />
          <Bar
            dataKey="strain"
            radius={[3, 3, 0, 0]}
            fill={C.orange}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Poids / Body Fat ─────────────────────────────────────────────────────

function WeightChart({
  bodyComposition,
}: {
  bodyComposition: BodyComp[];
}) {
  const hasLean = bodyComposition.some((b) => b.lean_mass_kg != null);
  const chartData = bodyComposition.map((b) => ({
    label: shortDateLabel(b.measured_at),
    poids: b.weight_kg,
    fat: b.body_fat_pct,
    lean: b.lean_mass_kg,
  }));

  return (
    <ChartCard title="Poids & composition">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-zinc-200, #e4e4e7)"
            opacity={0.5}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: C.zinc400 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="kg"
            tick={{ fontSize: 11, fill: C.zinc400 }}
            axisLine={false}
            tickLine={false}
            width={35}
            domain={["dataMin - 1", "dataMax + 1"]}
          />
          <YAxis
            yAxisId="pct"
            orientation="right"
            tick={{ fontSize: 11, fill: C.zinc400 }}
            axisLine={false}
            tickLine={false}
            width={35}
            domain={["dataMin - 1", "dataMax + 1"]}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: C.zinc800,
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 12,
            }}
            formatter={(val, name) => {
              if (name === "poids") return [`${val} kg`, "Poids"];
              if (name === "lean") return [`${val} kg`, "Masse maigre"];
              return [`${val}%`, "Body fat"];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(v: string) => {
              if (v === "poids") return "Poids (kg)";
              if (v === "lean") return "Masse maigre (kg)";
              return "Body fat (%)";
            }}
          />
          <Line
            yAxisId="kg"
            type="monotone"
            dataKey="poids"
            stroke={C.blue}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
          {hasLean && (
            <Line
              yAxisId="kg"
              type="monotone"
              dataKey="lean"
              stroke={C.green}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          )}
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="fat"
            stroke={C.orange}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>

      {bodyComposition.length >= 2 && (() => {
        const first = bodyComposition[0];
        const last = bodyComposition[bodyComposition.length - 1];
        const dW = last.weight_kg != null && first.weight_kg != null ? +(last.weight_kg - first.weight_kg).toFixed(1) : null;
        const dF = last.body_fat_pct != null && first.body_fat_pct != null ? +(last.body_fat_pct - first.body_fat_pct).toFixed(1) : null;
        const dL = last.lean_mass_kg != null && first.lean_mass_kg != null ? +(last.lean_mass_kg - first.lean_mass_kg).toFixed(1) : null;
        const fmt = (v: number, u: string) => `${v > 0 ? "+" : ""}${v} ${u}`;
        return (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-[var(--color-body)]">
            <span>Variation sur la période :</span>
            {dW != null && <span className={dW < 0 ? "text-[#15be53]" : dW > 0 ? "text-[#f97316]" : ""}>{fmt(dW, "kg")}</span>}
            {dF != null && <span className={dF < 0 ? "text-[#15be53]" : dF > 0 ? "text-[#f97316]" : ""}>{fmt(dF, "% MG")}</span>}
            {dL != null && <span className={dL > 0 ? "text-[#15be53]" : dL < 0 ? "text-[#f97316]" : ""}>{fmt(dL, "kg maigre")}</span>}
          </div>
        );
      })()}
    </ChartCard>
  );
}

// ── Récap par type (pills) ───────────────────────────────────────────────

function WorkoutTypePills({ workouts }: { workouts: Workout[] }) {
  const byType = new Map<string, { icon: string; label: string; count: number }>();
  for (const w of workouts) {
    const { label, icon } = formatWorkoutType(w.type);
    const existing = byType.get(label) ?? { icon, label, count: 0 };
    existing.count += 1;
    byType.set(label, existing);
  }
  const rows = Array.from(byType.values()).sort((a, b) => b.count - a.count);

  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {rows.map((s) => (
        <span
          key={s.label}
          className="inline-flex items-center gap-1 text-[11px] bg-[var(--color-border)]/40 dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 rounded-[var(--radius-sm)] px-2 py-0.5 text-[var(--color-label)] dark:text-white/70"
        >
          {s.icon} {s.label}
          <span className="text-[var(--color-body)]">×{s.count}</span>
        </span>
      ))}
    </div>
  );
}

// ── Résumé workouts ──────────────────────────────────────────────────────

function WorkoutsSummary({ workouts }: { workouts: Workout[] }) {
  const sorted = [...workouts].sort((a, b) => b.started_at.localeCompare(a.started_at));

  return (
    <ChartCard title={`Entraînements (${workouts.length})`}>
      <WorkoutTypePills workouts={workouts} />
      <div className="divide-y divide-[var(--color-border)] dark:divide-white/10">
        {sorted.map((w, i) => {
          const { label, icon } = formatWorkoutType(w.type);
          const d = new Date(w.started_at);
          const dateLabel = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
          const durMin = w.duration_min ?? 0;
          const durH = Math.floor(durMin / 60);
          const durM = Math.round(durMin % 60);
          const durationLabel = `${durH}h${durM.toString().padStart(2, "0")}`;

          return (
            <div key={i} className="flex items-center justify-between py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-lg">{icon}</span>
                <span className="font-normal text-[var(--color-heading)] dark:text-white">{label}</span>
              </div>
              <div className="text-right text-xs text-[var(--color-body)] tabular-nums space-x-3">
                <span className="capitalize">{dateLabel}</span>
                <span>{durationLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}

// ── Résumé de période ────────────────────────────────────────────────────

function avgOf(vals: (number | null)[]): number | null {
  const f = vals.filter((v): v is number => v != null);
  return f.length > 0 ? f.reduce((a, b) => a + b, 0) / f.length : null;
}

function Sparkline({ values, color }: { values: (number | null)[]; color: string }) {
  const valid = values.map((v, i) => (v != null ? { i, v } : null)).filter(Boolean) as { i: number; v: number }[];
  if (valid.length < 2) return null;

  const min = Math.min(...valid.map((p) => p.v));
  const max = Math.max(...valid.map((p) => p.v));
  const range = max - min || 1;
  const w = 80;
  const h = 28;
  const step = w / (values.length - 1);

  const points = valid.map((p) => `${p.i * step},${h - ((p.v - min) / range) * (h - 4) - 2}`).join(" ");

  return (
    <svg width={w} height={h} className="block">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KpiCard({
  icon,
  label,
  value,
  unit,
  delta,
  sparkValues,
  sparkColor,
  valueColor,
  record,
  subLine,
}: {
  icon: string;
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  sparkValues: (number | null)[];
  sparkColor: string;
  valueColor?: string;
  record?: string | null;
  subLine?: string | null;
}) {
  const deltaColor = delta
    ? delta.startsWith("+") ? "text-[#108c3d]" : delta.startsWith("-") ? "text-[#ea2261]" : "text-[var(--color-body)]"
    : "";

  return (
    <div
      className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-3.5"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{icon}</span>
          <span className="text-[10px] uppercase tracking-wide text-[var(--color-body)]">{label}</span>
        </div>
        {delta && (
          <span className={`text-[10px] tabular-nums font-normal ${deltaColor}`}>{delta}</span>
        )}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <span className={`text-xl font-light tabular-nums ${valueColor ?? "text-[var(--color-heading)] dark:text-white"}`}>
            {value}
          </span>
          {unit && <span className="text-xs text-[var(--color-body)] ml-0.5">{unit}</span>}
        </div>
        <Sparkline values={sparkValues} color={sparkColor} />
      </div>
      {subLine && (
        <p className="text-[10px] text-[var(--color-body)] mt-1">{subLine}</p>
      )}
      {record && (
        <div className="mt-1.5 flex items-center gap-1">
          <span className="text-[10px]">🏆</span>
          <span className="text-[10px] text-[var(--color-body)]">{record}</span>
        </div>
      )}
    </div>
  );
}

function PeriodSummary({
  data,
  offset,
}: {
  data: StatsPayload;
  period: Period;
  offset: number;
}) {
  const m = data.dailyMetrics;
  const pm = data.previousPeriod.dailyMetrics;

  const avgRecovery = avgOf(m.map((d) => d.recovery_score));
  const avgHrv = avgOf(m.map((d) => d.hrv_ms));
  const avgSleepMin = avgOf(m.map((d) => d.sleep_total_min));
  const avgSteps = avgOf(m.map((d) => d.steps));

  const prevAvgRecovery = avgOf(pm.map((d) => d.recovery_score));
  const prevAvgHrv = avgOf(pm.map((d) => d.hrv_ms));
  const prevAvgSleepMin = avgOf(pm.map((d) => d.sleep_total_min));
  const prevAvgSteps = avgOf(pm.map((d) => d.steps));

  const avgSleepH = avgSleepMin ? Math.floor(avgSleepMin / 60) : null;
  const avgSleepM = avgSleepMin ? Math.round(avgSleepMin % 60) : null;

  const recoveryColor =
    avgRecovery == null ? undefined
      : avgRecovery >= 7 ? "text-[#108c3d]"
      : avgRecovery >= 5 ? "text-[#9b6829]"
      : "text-[#ea2261]";

  const recoveryVals = m.map((d) => d.recovery_score);
  const hrvVals = m.map((d) => d.hrv_ms);
  const sleepVals = m.map((d) => d.sleep_total_min != null ? Math.round(d.sleep_total_min / 6) / 10 : null);
  const stepsVals = m.map((d) => d.steps);

  const bestRecovery = maxOf(m.map((d) => d.recovery_score));
  const bestHrv = maxOf(m.map((d) => d.hrv_ms));
  const bestSleep = maxOf(m.map((d) => d.sleep_total_min));
  const bestSteps = maxOf(m.map((d) => d.steps));

  // Strain
  const dailyStrain = computeDailyStrain(m, pm);
  const strainVals = dailyStrain.map((d) => d.strain);
  const avgStrain = avgOf(strainVals);
  const prevDailyStrain = computeDailyStrain(pm, []);
  const prevAvgStrain = avgOf(prevDailyStrain.map((d) => d.strain));
  const bestStrain = maxOf(strainVals);
  const avgStrainColor = avgStrain == null ? undefined
    : avgStrain >= 8 ? "text-[#ea2261]"
    : avgStrain >= 6 ? "text-[#f97316]"
    : avgStrain >= 3 ? "text-[#9b6829]"
    : "text-[#108c3d]";

  // Active kcal
  const avgActiveKcal = avgOf(m.map((d) => d.active_kcal));
  const prevAvgActiveKcal = avgOf(pm.map((d) => d.active_kcal));
  const activeKcalVals = m.map((d) => d.active_kcal);

  // Fréq. respiratoire
  const avgRespi = avgOf(m.map((d) => d.respiratory_rate));
  const prevAvgRespi = avgOf(pm.map((d) => d.respiratory_rate));
  const respiVals = m.map((d) => d.respiratory_rate);

  // SpO2
  const avgSpo2 = avgOf(m.map((d) => d.spo2_pct));
  const prevAvgSpo2 = avgOf(pm.map((d) => d.spo2_pct));
  const spo2Vals = m.map((d) => d.spo2_pct);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard
          icon="❤️"
          label="Recovery"
          value={avgRecovery != null ? `${Math.round(avgRecovery * 10) / 10}` : "—"}
          unit="/10"
          valueColor={recoveryColor}
          delta={deltaStr(avgRecovery, prevAvgRecovery)}
          sparkValues={recoveryVals}
          sparkColor={C.green}
          record={bestRecovery != null ? `Best : ${Math.round(bestRecovery * 10) / 10}/10` : null}
          subLine={arrowSubLine(avgRecovery, prevAvgRecovery, (v) => `${Math.round(v * 10) / 10}`)}
        />
        <KpiCard
          icon="💓"
          label="HRV"
          value={avgHrv != null ? `${Math.round(avgHrv)}` : "—"}
          unit="ms"
          delta={deltaStr(avgHrv, prevAvgHrv, 0)}
          sparkValues={hrvVals}
          sparkColor={C.purple}
          record={bestHrv != null ? `Best : ${Math.round(bestHrv)} ms` : null}
          subLine={arrowSubLine(avgHrv, prevAvgHrv, (v) => `${Math.round(v)} ms`, 1)}
        />
        <KpiCard
          icon="💤"
          label="Sommeil"
          value={avgSleepH != null ? `${avgSleepH}h${avgSleepM!.toString().padStart(2, "0")}` : "—"}
          delta={
            avgSleepMin != null && prevAvgSleepMin != null
              ? deltaStr(Math.round(avgSleepMin / 6) / 10, Math.round(prevAvgSleepMin / 6) / 10, 1, "h")
              : undefined
          }
          sparkValues={sleepVals}
          sparkColor={C.cyan}
          record={bestSleep != null ? `Best : ${Math.floor(bestSleep / 60)}h${Math.round(bestSleep % 60).toString().padStart(2, "0")}` : null}
          subLine={arrowSubLine(avgSleepMin, prevAvgSleepMin, (v) => `${Math.floor(v / 60)}h${Math.round(v % 60).toString().padStart(2, "0")}`, 10)}
        />
        <KpiCard
          icon="👟"
          label="Pas/jour"
          value={avgSteps != null ? `${(avgSteps / 1000).toFixed(1)}k` : "—"}
          delta={
            avgSteps != null && prevAvgSteps != null
              ? deltaStr(Math.round(avgSteps / 100) / 10, Math.round(prevAvgSteps / 100) / 10, 1, "k")
              : undefined
          }
          sparkValues={stepsVals}
          sparkColor={C.orange}
          record={bestSteps != null ? `Best : ${bestSteps.toLocaleString("fr-FR")} pas` : null}
          subLine={arrowSubLine(avgSteps, prevAvgSteps, (v) => `${(v / 1000).toFixed(1)}k`, 300)}
        />
        <KpiCard
          icon="⚡"
          label="Strain"
          value={avgStrain != null ? `${Math.round(avgStrain * 10) / 10}` : "—"}
          unit="/10"
          valueColor={avgStrainColor}
          delta={deltaStr(avgStrain, prevAvgStrain)}
          sparkValues={strainVals}
          sparkColor={C.orange}
          record={bestStrain != null ? `Max : ${Math.round(bestStrain * 10) / 10}/10` : null}
          subLine={arrowSubLine(avgStrain, prevAvgStrain, (v) => `${Math.round(v * 10) / 10}`)}
        />
        <KpiCard
          icon="🔥"
          label="Kcal actives"
          value={avgActiveKcal != null ? `${Math.round(avgActiveKcal)}` : "—"}
          unit="/j"
          delta={deltaStr(avgActiveKcal, prevAvgActiveKcal, 0)}
          sparkValues={activeKcalVals}
          sparkColor={C.red}
          subLine={arrowSubLine(avgActiveKcal, prevAvgActiveKcal, (v) => `${Math.round(v)}`, 20)}
        />
        {avgRespi != null && (
          <KpiCard
            icon="🫁"
            label="Respi"
            value={`${Math.round(avgRespi * 10) / 10}`}
            unit="/min"
            delta={deltaStr(avgRespi, prevAvgRespi)}
            sparkValues={respiVals}
            sparkColor={C.cyan}
            subLine={arrowSubLine(avgRespi, prevAvgRespi, (v) => `${Math.round(v * 10) / 10}/min`, 0.2)}
          />
        )}
        {avgSpo2 != null && (
          <KpiCard
            icon="🩸"
            label="SpO₂"
            value={`${Math.round(avgSpo2 * 10) / 10}`}
            unit="%"
            delta={deltaStr(avgSpo2, prevAvgSpo2)}
            sparkValues={spo2Vals}
            sparkColor={C.blue}
            subLine={arrowSubLine(avgSpo2, prevAvgSpo2, (v) => `${Math.round(v * 10) / 10}%`, 0.2)}
          />
        )}
      </div>

      {data.workouts.length > 0 && (() => {
        // Pour la période en cours (offset=0), comparer sur la même fenêtre temporelle
        const isCurrentPeriod = offset === 0;
        let prevComparable = data.previousPeriod.workouts.length;
        let showDelta = data.previousPeriod.workouts.length > 0;

        if (isCurrentPeriod && showDelta) {
          const startMs = new Date(`${data.startDate}T00:00:00Z`).getTime();
          const nowMs = Date.now();
          const elapsedDays = Math.floor((nowMs - startMs) / (1000 * 60 * 60 * 24)) + 1;
          const prevStartMs = new Date(`${data.previousPeriod.startDate}T00:00:00Z`).getTime();
          const prevCutoff = new Date(prevStartMs + elapsedDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          prevComparable = data.previousPeriod.workouts.filter(
            (w) => w.started_at.slice(0, 10) < prevCutoff,
          ).length;
        }

        const sessionsLabel = isCurrentPeriod
          ? `${data.workouts.length} séances (en cours)`
          : `${data.workouts.length} séances`;

        const sorted = [...data.workouts].sort((a, b) => b.started_at.localeCompare(a.started_at));

        return (
        <div
          className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-3.5"
          style={{ boxShadow: "var(--shadow-ambient)" }}
        >
          <div className="flex items-center gap-2 text-xs text-[var(--color-body)] mb-2">
            <span className="text-sm">💪</span>
            <span className="text-[10px] uppercase tracking-wide">{sessionsLabel}</span>
            {showDelta && (
              <DeltaBadge
                current={data.workouts.length}
                previous={prevComparable}
                suffix={isCurrentPeriod ? " (même fenêtre)" : undefined}
              />
            )}
          </div>
          <WorkoutTypePills workouts={data.workouts} />
          <div className="divide-y divide-[var(--color-border)] dark:divide-white/10">
            {sorted.map((w, i) => {
              const { label, icon } = formatWorkoutType(w.type);
              const d = new Date(w.started_at);
              const dateLabel = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
              const durMin = w.duration_min ?? 0;
              const durH = Math.floor(durMin / 60);
              const durM = Math.round(durMin % 60);
              const durationLabel = `${durH}h${durM.toString().padStart(2, "0")}`;

              return (
                <div key={i} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span>{icon}</span>
                    <span className="font-normal text-[var(--color-heading)] dark:text-white text-xs">{label}</span>
                  </div>
                  <div className="text-right text-[11px] text-[var(--color-body)] tabular-nums space-x-2">
                    <span className="capitalize">{dateLabel}</span>
                    <span>{durationLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        );
      })()}
    </div>
  );
}

// Calcule le strain pour chaque jour à partir des active_kcal
// Utilise les données de la période précédente + courante pour la baseline
function computeDailyStrain(
  metrics: { date: string; active_kcal: number | null }[],
  prevMetrics: { date: string; active_kcal: number | null }[],
): { date: string; strain: number }[] {
  // Baseline = avg active_kcal des 30 derniers jours précédents
  const prevKcals = prevMetrics
    .map((m) => m.active_kcal)
    .filter((v): v is number => v != null && v > 0);
  // Fallback sur la moyenne de la période courante si pas de données précédentes
  const currentKcals = metrics
    .map((m) => m.active_kcal)
    .filter((v): v is number => v != null && v > 0);
  const baseline = prevKcals.length >= 3
    ? prevKcals
    : currentKcals.length >= 3
      ? currentKcals
      : [];

  return metrics.map((m) => {
    const result = computeStrainScore(m.active_kcal ?? 0, baseline);
    return { date: m.date, strain: result.score };
  });
}

function maxOf(vals: (number | null)[]): number | null {
  const f = vals.filter((v): v is number => v != null);
  return f.length > 0 ? Math.max(...f) : null;
}

function deltaStr(
  current: number | null,
  previous: number | null,
  decimals = 1,
  suffix = "",
): string | undefined {
  if (current == null || previous == null) return undefined;
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return undefined;
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff.toFixed(decimals)}${suffix}`;
}

function arrowSubLine(
  current: number | null,
  previous: number | null,
  format: (v: number) => string,
  threshold = 0.3,
): string | null {
  if (current == null || previous == null) return null;
  const arrow = current >= previous + threshold ? "↑" : current <= previous - threshold ? "↓" : "≈";
  return `${arrow} moy ${format(previous)}`;
}

function DeltaBadge({
  current,
  previous,
  suffix,
}: {
  current: number;
  previous: number;
  suffix?: string;
}) {
  const diff = current - previous;
  if (diff === 0) return null;
  const color =
    diff > 0
      ? "text-[#108c3d]"
      : "text-[#ea2261]";
  return (
    <span className={`text-[10px] font-normal ${color}`}>
      {diff > 0 ? "+" : ""}
      {diff} vs précédent{suffix ?? ""}
    </span>
  );
}


// ── Journal Stats ───────────────────────────────────────────────────────

const MOOD_EMOJIS = ["", "😞", "😕", "😐", "🙂", "😄"];
const ENERGY_EMOJIS = ["", "🪫", "😴", "⚡", "💪", "🔥"];
const STRESS_EMOJIS = ["", "🧘", "😌", "😤", "😰", "🤯"];

function JournalStatsSection({
  entries,
  averages,
  prevAverages,
}: {
  entries: JournalEntry[];
  averages: JournalAverages;
  prevAverages?: JournalAverages;
}) {
  const filledEntries = entries.filter(
    (e) => e.mood != null || e.energy != null || e.stress != null || e.notes || e.gratitude,
  ).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section
      className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-4 sm:p-5"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <h2 className="text-xs font-normal uppercase tracking-wide text-[var(--color-body)] mb-4">
        Journal ({averages.entryCount ?? filledEntries.length} entrées)
      </h2>

      {/* Moyennes */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <JournalAvgCell
          label="Humeur"
          value={averages.mood}
          prev={prevAverages?.mood}
          emojis={MOOD_EMOJIS}
          positiveIsGood
        />
        <JournalAvgCell
          label="Énergie"
          value={averages.energy}
          prev={prevAverages?.energy}
          emojis={ENERGY_EMOJIS}
          positiveIsGood
        />
        <JournalAvgCell
          label="Stress"
          value={averages.stress}
          prev={prevAverages?.stress}
          emojis={STRESS_EMOJIS}
          positiveIsGood={false}
        />
      </div>

      {/* Entrées */}
      {filledEntries.length > 0 && (
        <div className="space-y-2 border-t border-[var(--color-border)] dark:border-white/10 pt-4">
          {filledEntries.map((entry) => (
            <JournalEntryRow key={entry.date} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}

function JournalAvgCell({
  label,
  value,
  prev,
  emojis,
  positiveIsGood,
}: {
  label: string;
  value: number | null;
  prev: number | null | undefined;
  emojis: string[];
  positiveIsGood: boolean;
}) {
  const emoji = value != null ? emojis[Math.round(value)] ?? "" : "";
  const delta = value != null && prev != null ? value - prev : null;

  let deltaStr = "";
  let deltaColor = "";
  if (delta != null && Math.abs(delta) >= 0.1) {
    deltaStr = delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);
    const good = positiveIsGood ? delta > 0 : delta < 0;
    deltaColor = good ? "text-[#108c3d]" : "text-[#ea2261]";
  }

  return (
    <div className="text-center">
      <div className="text-xl mb-0.5">{emoji || "—"}</div>
      <div className="text-base font-light tabular-nums text-[var(--color-heading)] dark:text-white">
        {value != null ? value.toFixed(1) : "—"}
        <span className="text-xs text-[var(--color-body)]">/5</span>
      </div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-body)] mt-0.5">
        {label}
      </div>
      {deltaStr && (
        <div className={`text-[10px] tabular-nums font-normal mt-0.5 ${deltaColor}`}>
          {deltaStr} vs préc.
        </div>
      )}
    </div>
  );
}

function JournalImpactSection({
  journalEntries,
  dailyMetrics,
}: {
  journalEntries: JournalEntry[];
  dailyMetrics: DailyMetric[];
}) {
  const impact = computeJournalImpact(
    journalEntries.map((e) => ({ date: e.date, mood: e.mood, energy: e.energy, stress: e.stress })),
    dailyMetrics.map((m) => ({ date: m.date, recovery_score: m.recovery_score })),
  );

  if (impact.length === 0) return null;

  return (
    <section
      className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-4 sm:p-5"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <h2 className="text-xs font-normal uppercase tracking-wide text-[var(--color-body)] mb-3">
        Impact journal → recovery J+1
      </h2>
      <div className="space-y-2">
        {impact.map((f) => (
          <div key={f.label} className="flex items-center gap-2 text-sm">
            <span>{f.emoji}</span>
            <span className="text-[var(--color-body)] flex-1">{f.label}</span>
            <span className={`font-normal tabular-nums ${
              f.direction === "positive" ? "text-[#108c3d]" :
              f.direction === "negative" ? "text-[#ea2261]" :
              "text-[var(--color-body)]"
            }`}>
              {f.impact > 0 ? "+" : ""}{f.impact} pts
            </span>
            <span className="text-[10px] text-[var(--color-body)]/50">
              ({f.sampleSize}j)
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-body)]/60 mt-2">
        Delta recovery moyen entre jours haut vs bas sur la période
      </p>
    </section>
  );
}

function JournalEntryRow({ entry }: { entry: JournalEntry }) {
  const d = new Date(`${entry.date}T12:00:00Z`);
  const label = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-border)]/30 dark:bg-white/3 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-normal text-[var(--color-heading)] dark:text-white capitalize">
          {label}
        </span>
        <div className="flex gap-2 text-sm">
          {entry.mood != null && <span title="Humeur">{MOOD_EMOJIS[entry.mood]}</span>}
          {entry.energy != null && <span title="Énergie">{ENERGY_EMOJIS[entry.energy]}</span>}
          {entry.stress != null && <span title="Stress">{STRESS_EMOJIS[entry.stress]}</span>}
        </div>
      </div>
      {entry.notes && (
        <p className="text-xs text-[var(--color-body)] leading-relaxed">{entry.notes}</p>
      )}
      {entry.gratitude && (
        <p className="text-xs text-[var(--color-brand-purple)] leading-relaxed mt-1">
          🙏 {entry.gratitude}
        </p>
      )}
    </div>
  );
}

