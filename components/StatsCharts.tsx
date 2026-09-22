"use client";

// Statistiques : comment tu évolues (semaine, mois, année), comparé à la
// période précédente. Mêmes calculs, zones et couleurs que l'accueil et les
// pages de détail, qui répondent elles à « où j'en suis ».

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { shortDateLabel } from "@/lib/stats-data";
import { AiCorrelations } from "@/components/AiCorrelations";
import { dateInTz } from "@/lib/dates";
import { HR_ZONES } from "@/lib/hr-zones";
import { formZone } from "@/lib/form";
import { strainColor } from "@/lib/strain-score";
import { isIncompleteNight } from "@/lib/recovery-score";
import { BODY_METRICS_BY_KEY, formatMetric, isFavorable, type BodyMetricKey, type MetricStatus } from "@/lib/body-metrics";
import { normalizeWorkoutType, workoutDisplayLabel, workoutEmoji } from "@/lib/workout-types";
import { VIVID, sportColor, tint, tintedBackground } from "@/lib/palette";
import { ZonedLineChart } from "@/components/charts/ZonedLineChart";
import { HistoryChart } from "@/components/charts/HistoryChart";
import { Delta, StatGrid } from "@/components/detail/DetailBits";
import { BodyTrendChart } from "@/components/charts/BodyTrendChart";
import { CompositionBar } from "@/components/body/CompositionBits";
import { FAT_COLOR, LEAN_COLOR, latestComposition } from "@/lib/body-composition";

// ── Types ────────────────────────────────────────────────────────────────

type Period = "week" | "month" | "year";

type DailyMetric = {
  date: string;
  hrv_ms: number | null;
  sleeping_hr_bpm: number | null;
  respiratory_rate: number | null;
  spo2_pct: number | null;
  wrist_temp_c: number | null;
  sleep_total_min: number | null;
  sleep_rem_pct: number | null;
  sleep_deep_pct: number | null;
  sleep_awake_pct: number | null;
  sleep_start: string | null;
  sleep_end: string | null;
  steps: number | null;
  active_kcal: number | null;
  cardio_load: number | null;
  recovery_score: number | null;
};

type Workout = {
  id: string;
  started_at: string;
  type: string;
  duration_min: number | null;
  kcal: number | null;
  avg_hr_bpm: number | null;
  cardio_load: number | null;
  hr_zone_min?: number[] | null; // minutes par zone de FC (50-60 … 90-100 % FC max)
  hr_drop_1min: number | null; // baisse de FC 1 min après la fin
  distance_km: number | null;
  max_speed_kmh: number | null;
};

type PrevWorkout = { started_at: string; type: string; duration_min: number | null; cardio_load: number | null };

type BodyComp = {
  measured_at: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
};

type NightMetric = {
  key: BodyMetricKey;
  points: { date: string; value: number; low: number | null; high: number | null; status: MetricStatus | null }[];
};

type StatsPayload = {
  period: string;
  offset: number;
  tz: string;
  startDate: string;
  endDate: string;
  label: string;
  today: string;
  sleepTargetMin: number;
  strainByDate: Record<string, number>;
  loadSeries: { date: string; load: number | null; ratio: number | null; form: number | null }[];
  nightMetrics: NightMetric[];
  dailyMetrics: DailyMetric[];
  workouts: Workout[];
  bodyComposition: BodyComp[];
  previousPeriod: {
    startDate: string;
    endDate: string;
    label: string;
    dailyMetrics: DailyMetric[];
    workouts: PrevWorkout[];
  };
};

// ── Couleurs ─────────────────────────────────────────────────────────────

const C = {
  green: VIVID.green,
  blue: VIVID.blue,
  orange: VIVID.orange,
  zinc400: "#64748d",
  zinc800: "#0d1520",
};
const ZONES = HR_ZONES;
const RECOVERY_COLOR = (v: number) => (v >= 7 ? VIVID.green : v >= 5 ? VIVID.yellow : VIVID.red);
const TOOLTIP_STYLE = { backgroundColor: C.zinc800, border: "none", borderRadius: 8, color: "#fff", fontSize: 12 };

// ── Petits calculs ───────────────────────────────────────────────────────

function avgOf(vals: (number | null | undefined)[]): number | null {
  const v = vals.filter((x): x is number => x != null);
  return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
const r1 = (v: number) => Math.round(v * 10) / 10;
const fr1 = (v: number) => r1(v).toString().replace(".", ",");
function fmtHM(min: number): string {
  return `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, "0")}`;
}
function diff(a: number | null, b: number | null): number | null {
  return a != null && b != null ? a - b : null;
}
// Dernier jour à prendre en compte : fin de période, ou aujourd'hui si elle est en cours
function lastDayOf(end: string, today: string): string {
  return end < today ? end : today;
}
function inPeriod(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

// Fin de la période précédente comparable : même nombre de jours écoulés
// si la période en cours n'est pas terminée
function comparableEnd(data: StatsPayload, lastDay: string): string {
  const day = 86_400_000;
  const elapsed = Math.round((Date.parse(`${lastDay}T12:00:00Z`) - Date.parse(`${data.startDate}T12:00:00Z`)) / day);
  const end = new Date(Date.parse(`${data.previousPeriod.startDate}T12:00:00Z`) + elapsed * day).toISOString().slice(0, 10);
  return end < data.previousPeriod.endDate ? end : data.previousPeriod.endDate;
}

// ── Onglets ──────────────────────────────────────────────────────────────

type StatsTab = "resume" | "entrainement" | "recuperation" | "corps";

const STATS_TABS: { key: StatsTab; label: string; icon: string }[] = [
  { key: "resume", label: "Résumé", icon: "📊" },
  { key: "entrainement", label: "Entraînement", icon: "🏄" },
  { key: "recuperation", label: "Récupération", icon: "💚" },
  { key: "corps", label: "Corps", icon: "⚖️" },
];

// ── Composant principal ──────────────────────────────────────────────────

export function StatsCharts() {
  const [period, setPeriod] = useState<Period>("month");
  const [offset, setOffset] = useState(0);
  const [activeTab, setActiveTab] = useState<StatsTab>("resume");
  const [data, setData] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  // Chargement à chaque changement de période ; l'état "chargement" est posé
  // par les boutons (changePeriod / changeOffset), pas dans l'effet
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stats?period=${period}&offset=${offset}`)
      .then((res) => {
        if (!res.ok) throw new Error("Chargement des statistiques impossible");
        return res.json() as Promise<StatsPayload>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period, offset]);

  const changePeriod = (p: Period) => {
    setLoading(true);
    setPeriod(p);
    setOffset(0);
  };
  const changeOffset = (o: number) => {
    if (o === offset) return;
    setLoading(true);
    setOffset(o);
  };

  const periodTabs: { key: Period; label: string }[] = [
    { key: "week", label: "Semaine" },
    { key: "month", label: "Mois" },
    { key: "year", label: "Année" },
  ];

  return (
    <div className="space-y-5">
      {/* Sélecteur de période */}
      <div className="space-y-3">
        <div className="flex gap-1 bg-[var(--color-border)]/50 dark:bg-white/5 rounded-[var(--radius-md)] p-1 w-fit">
          {periodTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => changePeriod(t.key)}
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
            onClick={() => changeOffset(offset + 1)}
            aria-label="Période précédente"
            className="rounded-[var(--radius-sm)] px-2 py-1 text-sm text-[var(--color-body)] hover:bg-[var(--color-border)]/50 dark:hover:bg-white/5 transition-colors"
          >
            ←
          </button>
          <button
            onClick={() => changeOffset(0)}
            className={`text-sm font-normal ${offset === 0 ? "text-[var(--color-brand-purple)]" : "text-[var(--color-heading)] dark:text-white hover:text-[var(--color-brand-purple)]"}`}
          >
            {data?.label ?? "…"}
          </button>
          <button
            onClick={() => changeOffset(Math.max(0, offset - 1))}
            disabled={offset === 0}
            aria-label="Période suivante"
            className="rounded-[var(--radius-sm)] px-2 py-1 text-sm text-[var(--color-body)] hover:bg-[var(--color-border)]/50 dark:hover:bg-white/5 transition-colors disabled:opacity-30"
          >
            →
          </button>
          {data?.previousPeriod.label && (
            <span className="text-xs text-[var(--color-body)] uppercase">vs. {data.previousPeriod.label}</span>
          )}
        </div>
      </div>

      {/* Onglets de contenu */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {STATS_TABS.filter((t) => t.key !== "corps" || !data || data.bodyComposition.length > 0).map((t) => (
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

      {loading && <div className="text-center text-sm text-[var(--color-body)] py-12">Chargement…</div>}

      {!loading && data && (
        <div className="space-y-5">
          {activeTab === "resume" && <SummaryTab data={data} period={period} />}
          {activeTab === "entrainement" && <TrainingTab data={data} period={period} />}
          {activeTab === "recuperation" && <RecoveryTab data={data} />}
          {activeTab === "corps" &&
            (data.bodyComposition.length > 0 ? (
              <>
                <BodyStats bodies={data.bodyComposition} />
                <div className="flex justify-between text-sm">
                  <Link href="/corps" className="text-[var(--color-brand-purple)] hover:underline">
                    Détail et verdict ›
                  </Link>
                  <Link href="/biologie" className="text-[var(--color-brand-purple)] hover:underline">
                    Biologie ›
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--color-body)]">Pas de pesée sur cette période.</p>
            ))}
        </div>
      )}

      {!loading && !data && <div className="text-center text-sm text-[var(--color-body)] py-12">Erreur de chargement.</div>}
    </div>
  );
}

// ── Résumé ───────────────────────────────────────────────────────────────

// Pavé d'indicateur teinté par son statut, comparé à la période précédente
function KpiTile({
  label,
  value,
  unit,
  color,
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  color: string;
  sub?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[var(--radius-lg)] border p-3.5 sm:p-4 min-w-0"
      style={{ background: tintedBackground(color), borderColor: tint(color, 0.3), boxShadow: "var(--shadow-ambient)" }}
    >
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[var(--color-body)]">
        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        {label}
      </p>
      <p className="mt-1.5 text-[var(--color-heading)] dark:text-white">
        <span className="text-2xl sm:text-3xl font-light tabular-nums">{value}</span>
        {unit && <span className="text-sm text-[var(--color-body)] ml-1">{unit}</span>}
      </p>
      {sub && <div className="text-[11px] text-[var(--color-body)] mt-1">{sub}</div>}
    </div>
  );
}

function SummaryTab({ data, period }: { data: StatsPayload; period: Period }) {
  const [showCorrelations, setShowCorrelations] = useState(false);
  const m = data.dailyMetrics;
  const lastDay = lastDayOf(data.endDate, data.today);
  // Période en cours : on compare aux mêmes jours de la période précédente
  // (1er-21 septembre contre 1er-21 août), sinon le volume paraît en baisse
  const prevEnd = comparableEnd(data, lastDay);
  const pm = data.previousPeriod.dailyMetrics.filter((d) => d.date <= prevEnd);
  const prevWorkouts = data.previousPeriod.workouts.filter((w) => dateInTz(w.started_at, data.tz) <= prevEnd);

  const rec = avgOf(m.map((d) => d.recovery_score));
  const prevRec = avgOf(pm.map((d) => d.recovery_score));
  const strainVals = (start: string, end: string) =>
    Object.entries(data.strainByDate)
      .filter(([d]) => inPeriod(d, start, end) && d <= data.today)
      .map(([, v]) => v);
  const strain = avgOf(strainVals(data.startDate, data.endDate));
  const prevStrain = avgOf(strainVals(data.previousPeriod.startDate, prevEnd));
  const formAt = (start: string, end: string) =>
    [...data.loadSeries].reverse().find((p) => inPeriod(p.date, start, end) && p.form != null)?.form ?? null;
  const form = formAt(data.startDate, lastDay);
  const prevForm = formAt(data.previousPeriod.startDate, prevEnd);
  const hours = data.workouts.reduce((a, w) => a + (w.duration_min ?? 0), 0) / 60;
  const prevHours = prevWorkouts.reduce((a, w) => a + (w.duration_min ?? 0), 0) / 60;
  // Nuits incomplètes (moins de 3 h) exclues des moyennes
  const fullSleep = (rows: DailyMetric[]) => rows.map((d) => (isIncompleteNight(d.sleep_total_min) ? null : d.sleep_total_min));
  const sleep = avgOf(fullSleep(m));
  const prevSleep = avgOf(fullSleep(pm));
  const hrv = avgOf(m.map((d) => d.hrv_ms));
  const prevHrv = avgOf(pm.map((d) => d.hrv_ms));
  const steps = avgOf(m.map((d) => d.steps));
  const prevSteps = avgOf(pm.map((d) => d.steps));
  const kcal = avgOf(m.map((d) => d.active_kcal));
  const prevKcal = avgOf(pm.map((d) => d.active_kcal));

  const vs = (d: number | null, betterWhen: "up" | "down" | "none", fmt: (v: number) => string) =>
    d != null ? <Delta diff={d} betterWhen={betterWhen} format={fmt} /> : <span>pas de comparaison</span>;

  // Records de la période
  const bestRec = m.filter((d) => d.recovery_score != null).sort((a, b) => b.recovery_score! - a.recovery_score!)[0];
  const bigDay = Object.entries(data.strainByDate)
    .filter(([d]) => inPeriod(d, data.startDate, data.endDate))
    .sort((a, b) => b[1] - a[1])[0];
  const longest = [...data.workouts].sort((a, b) => (b.duration_min ?? 0) - (a.duration_min ?? 0))[0];
  const heaviest = [...data.workouts].sort((a, b) => (b.cardio_load ?? 0) - (a.cardio_load ?? 0))[0];
  const dateLabel = (d: string) => shortDateLabel(d);

  return (
    <>
      <SummarySentence
        data={data}
        period={period}
        rec={rec}
        prevRec={prevRec}
        hours={hours}
        prevHours={prevHours}
        form={form}
        partial={prevEnd < data.previousPeriod.endDate}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiTile
          label="Récupération"
          value={rec != null ? fr1(rec) : "—"}
          unit="/10"
          color={rec != null ? RECOVERY_COLOR(rec) : VIVID.gray}
          sub={vs(diff(rec, prevRec), "up", fr1)}
        />
        <KpiTile
          label="Strain moyen"
          value={strain != null ? fr1(strain) : "—"}
          unit="/10"
          color={strain != null ? strainColor(strain) : VIVID.gray}
          sub={vs(diff(strain, prevStrain), "none", fr1)}
        />
        <KpiTile
          label="Forme"
          value={form != null ? (form > 0 ? `+${form}` : form < 0 ? `−${Math.abs(form)}` : "0") : "—"}
          color={form != null ? formZone(form).color : VIVID.gray}
          sub={
            form != null ? (
              <>
                {formZone(form).label} · {vs(diff(form, prevForm), "none", (v) => String(Math.round(v)))}
              </>
            ) : (
              "pas assez d'historique"
            )
          }
        />
        <KpiTile
          label="Séances"
          value={String(data.workouts.length)}
          color={VIVID.indigo}
          sub={
            <>
              {hours > 0 ? `${fmtHM(hours * 60)} · ` : ""}
              {vs(diff(data.workouts.length, prevWorkouts.length), "none", (v) => String(Math.round(v)))}
            </>
          }
        />
        <KpiTile
          label="Sommeil"
          value={sleep != null ? fmtHM(sleep) : "—"}
          color={sleep == null ? VIVID.gray : sleep >= data.sleepTargetMin ? VIVID.green : sleep >= data.sleepTargetMin - 45 ? VIVID.yellow : VIVID.red}
          sub={vs(diff(sleep, prevSleep), "up", (v) => `${Math.round(v)} min`)}
        />
        <KpiTile
          label="HRV"
          value={hrv != null ? String(Math.round(hrv)) : "—"}
          unit="ms"
          color={VIVID.cyan}
          sub={vs(diff(hrv, prevHrv), "up", (v) => `${Math.round(v)} ms`)}
        />
      </div>

      {/* Activité quotidienne : un seul pavé */}
      <div className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-4" style={{ boxShadow: "var(--shadow-ambient)" }}>
        <p className="text-[11px] uppercase tracking-wide text-[var(--color-body)] mb-2">Activité quotidienne</p>
        <StatGrid
          cols={2}
          items={[
            {
              label: "🚶 Pas / jour",
              value: steps != null ? Math.round(steps).toLocaleString("fr-FR") : "—",
              sub: vs(diff(steps, prevSteps), "up", (v) => Math.round(v).toLocaleString("fr-FR")),
            },
            {
              label: "🔥 Kcal actives / jour",
              value: kcal != null ? String(Math.round(kcal)) : "—",
              sub: vs(diff(kcal, prevKcal), "up", (v) => String(Math.round(v))),
            },
          ]}
        />
      </div>

      {/* Records */}
      <ChartCard title="Records de la période">
        <div className="space-y-2.5 text-sm">
          {bestRec && (
            <RecordRow emoji="💚" label="Meilleure récupération" value={`${fr1(bestRec.recovery_score!)}/10`} date={dateLabel(bestRec.date)} color={RECOVERY_COLOR(bestRec.recovery_score!)} />
          )}
          {bigDay && <RecordRow emoji="🔥" label="Plus grosse journée" value={`Strain ${fr1(bigDay[1])}`} date={dateLabel(bigDay[0])} color={strainColor(bigDay[1])} />}
          {longest?.duration_min != null && (
            <RecordRow
              emoji={workoutEmoji(longest.type)}
              label="Plus longue séance"
              value={`${workoutDisplayLabel(longest.type)} · ${fmtHM(longest.duration_min)}`}
              date={dateLabel(dateInTz(longest.started_at, data.tz))}
              color={sportColor(normalizeWorkoutType(longest.type))}
              href={`/seance/${longest.id}`}
            />
          )}
          {heaviest?.cardio_load != null && heaviest.cardio_load > 0 && (
            <RecordRow
              emoji={workoutEmoji(heaviest.type)}
              label="Séance la plus chargée"
              value={`${workoutDisplayLabel(heaviest.type)} · charge ${heaviest.cardio_load}`}
              date={dateLabel(dateInTz(heaviest.started_at, data.tz))}
              color={sportColor(normalizeWorkoutType(heaviest.type))}
              href={`/seance/${heaviest.id}`}
            />
          )}
          {!bestRec && !bigDay && !longest && <p className="text-[var(--color-body)]">Pas encore de données sur cette période.</p>}
        </div>
      </ChartCard>

      {/* Corrélations IA : générées seulement sur demande */}
      {showCorrelations ? (
        <AiCorrelations />
      ) : (
        <button
          onClick={() => setShowCorrelations(true)}
          className="w-full rounded-[var(--radius-lg)] border border-dashed border-[var(--color-brand-purple)]/40 px-4 py-3 text-sm text-[var(--color-brand-purple)] hover:bg-[var(--color-brand-purple)]/5 transition-colors"
        >
          🔗 Analyser les corrélations (IA)
        </button>
      )}
    </>
  );
}

function RecordRow({ emoji, label, value, date, color, href }: { emoji: string; label: string; value: string; date: string; color: string; href?: string }) {
  const content = (
    <div className="flex items-center gap-3">
      <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: tint(color, 0.18) }} aria-hidden>
        {emoji}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-[var(--color-body)]">{label}</p>
        <p className="text-[var(--color-heading)] dark:text-white truncate">{value}</p>
      </div>
      <span className="text-xs text-[var(--color-body)] shrink-0">{date}</span>
      {href && <span className="text-[var(--color-body)]">›</span>}
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-80">
      {content}
    </Link>
  ) : (
    content
  );
}

// Phrase de synthèse calculée (pas d'IA) : volume, récupération, forme
function SummarySentence({
  data,
  period,
  rec,
  prevRec,
  hours,
  prevHours,
  form,
  partial,
}: {
  data: StatsPayload;
  period: Period;
  rec: number | null;
  prevRec: number | null;
  hours: number;
  prevHours: number;
  form: number | null;
  partial: boolean;
}) {
  const unit = period === "week" ? "Semaine" : period === "month" ? "Mois" : "Année";
  // "que la période précédente" ou "qu'à la même date de la période précédente"
  const than = partial ? "qu'à la même date de la période précédente" : "que la période précédente";
  const parts: string[] = [];
  if (data.workouts.length === 0) parts.push(`${unit} sans séance enregistrée`);
  else if (prevHours > 0) {
    const change = (hours - prevHours) / prevHours;
    parts.push(
      change > 0.15
        ? `${unit} plus chargé ${than} (${fmtHM(hours * 60)} d'entraînement contre ${fmtHM(prevHours * 60)})`
        : change < -0.15
          ? `${unit} plus léger ${than} (${fmtHM(hours * 60)} contre ${fmtHM(prevHours * 60)})`
          : `Volume stable (${fmtHM(hours * 60)} d'entraînement)`,
    );
  } else parts.push(`${data.workouts.length} séance${data.workouts.length > 1 ? "s" : ""}, ${fmtHM(hours * 60)} d'entraînement`);
  if (rec != null) {
    const d = prevRec != null ? rec - prevRec : 0;
    parts.push(
      prevRec == null || Math.abs(d) < 0.3
        ? `récupération stable (${fr1(rec)}/10)`
        : d > 0
          ? `récupération en hausse (${fr1(rec)} contre ${fr1(prevRec)})`
          : `récupération en baisse (${fr1(rec)} contre ${fr1(prevRec)})`,
    );
  }
  if (form != null) parts.push(`forme : ${formZone(form).long}`);
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-brand-purple)]/5 border border-[var(--color-brand-purple)]/10 px-4 py-3">
      <p className="text-sm text-[var(--color-heading)] dark:text-white/90">{parts.join(", ")}.</p>
    </div>
  );
}

// ── Entraînement ─────────────────────────────────────────────────────────

// Clé de regroupement : jour (semaine), semaine (mois), mois (année)
function bucketKey(date: string, period: Period): string {
  if (period === "week") return date;
  if (period === "month") return mondayOf(date);
  return date.slice(0, 7);
}
function bucketLabel(key: string, period: Period): string {
  if (period === "week") return shortDateLabel(key);
  if (period === "month") return `sem. ${shortDateLabel(key)}`;
  return new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" }).format(new Date(`${key}-15T12:00:00Z`));
}

function TrainingTab({ data, period }: { data: StatsPayload; period: Period }) {
  const lastDay = lastDayOf(data.endDate, data.today);
  const current = data.loadSeries.filter((p) => inPeriod(p.date, data.startDate, lastDay));
  const strainPoints = Object.entries(data.strainByDate)
    .filter(([d]) => inPeriod(d, data.startDate, lastDay))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));

  return (
    <>
      <LoadBySport data={data} period={period} />
      {current.some((p) => p.ratio != null) && (
        <ChartCard title="Ratio de charge (7 j / 42 j)">
          <ZonedLineChart kind="balance" points={current.filter((p) => p.ratio != null).map((p) => ({ date: p.date, value: p.ratio! }))} />
        </ChartCard>
      )}
      {current.some((p) => p.form != null) && (
        <ChartCard title="Forme d'entraînement">
          <ZonedLineChart kind="form" points={current.filter((p) => p.form != null).map((p) => ({ date: p.date, value: p.form! }))} />
        </ChartCard>
      )}
      <ZonesChart workouts={data.workouts} period={period} tz={data.tz} />
      <SportTable workouts={data.workouts} />
      {strainPoints.length > 0 && (
        <ChartCard title="Strain jour par jour">
          <ZonedLineChart kind="strain" points={strainPoints} />
        </ChartCard>
      )}
    </>
  );
}

// Charge cardio empilée par sport, plus l'activité hors séances (même
// décomposition que la page Strain)
function LoadBySport({ data, period }: { data: StatsPayload; period: Period }) {
  const lastDay = lastDayOf(data.endDate, data.today);
  const sports = new Map<string, string>(); // clé normalisée → libellé
  const buckets = new Map<string, Record<string, number>>();
  const add = (key: string, sport: string, v: number) => {
    const b = buckets.get(key) ?? {};
    b[sport] = (b[sport] ?? 0) + v;
    buckets.set(key, b);
  };
  // Charge des séances par jour, pour déduire le hors-séances
  const workoutLoadByDay = new Map<string, number>();
  for (const w of data.workouts) {
    if (w.cardio_load == null) continue;
    const day = dateInTz(w.started_at, data.tz);
    const sport = normalizeWorkoutType(w.type);
    sports.set(sport, workoutDisplayLabel(w.type));
    add(bucketKey(day, period), sport, w.cardio_load);
    workoutLoadByDay.set(day, (workoutLoadByDay.get(day) ?? 0) + w.cardio_load);
  }
  for (const p of data.loadSeries) {
    if (!inPeriod(p.date, data.startDate, lastDay) || p.load == null) continue;
    const rest = Math.max(0, p.load - (workoutLoadByDay.get(p.date) ?? 0));
    add(bucketKey(p.date, period), "_hors", rest);
  }
  if (buckets.size === 0) return null;

  const keys = [...sports.keys()];
  const chartData = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({ label: bucketLabel(key, period), ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Math.round(x)])) }));
  const total = [...buckets.values()].reduce((a, b) => a + Object.values(b).reduce((x, y) => x + y, 0), 0);
  const title = period === "week" ? "Charge par jour" : period === "month" ? "Charge par semaine" : "Charge par mois";

  return (
    <ChartCard title={title}>
      <p className="text-sm text-[var(--color-body)] mb-3">
        Total <span className="text-[var(--color-heading)] dark:text-white">{Math.round(total)}</span>, dont{" "}
        {Math.round((1 - [...buckets.values()].reduce((a, b) => a + (b._hors ?? 0), 0) / Math.max(1, total)) * 100)} % en séance.
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" opacity={0.5} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.zinc400 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11, fill: C.zinc400 }} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            cursor={{ fill: "rgba(100,116,141,0.08)" }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(val, name) => [String(val), name === "_hors" ? "Hors séances" : sports.get(String(name)) ?? String(name)]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(v: string) => (v === "_hors" ? "Hors séances" : `${workoutEmoji(v)} ${sports.get(v) ?? v}`)}
          />
          {keys.map((k) => (
            <Bar key={k} dataKey={k} stackId="load" fill={sportColor(k)} strokeWidth={2} className="stroke-white dark:stroke-[#0d1520]" />
          ))}
          <Bar dataKey="_hors" stackId="load" fill="#c7c7cc" strokeWidth={2} className="stroke-white dark:stroke-[#0d1520]" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// Bilan par sport : volume, charge, FC, récupération cardio, et tracé si GPS
function SportTable({ workouts }: { workouts: Workout[] }) {
  if (workouts.length === 0) return null;
  const bySport = new Map<string, Workout[]>();
  for (const w of workouts) {
    const k = normalizeWorkoutType(w.type);
    bySport.set(k, [...(bySport.get(k) ?? []), w]);
  }
  const rows = [...bySport.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <ChartCard title="Par sport">
      <div className="space-y-3">
        {rows.map(([key, ws]) => {
          const color = sportColor(key);
          const minutes = ws.reduce((a, w) => a + (w.duration_min ?? 0), 0);
          const load = avgOf(ws.map((w) => w.cardio_load));
          const hr = avgOf(ws.map((w) => w.avg_hr_bpm));
          const drop = avgOf(ws.map((w) => w.hr_drop_1min));
          const dist = ws.reduce((a, w) => a + Number(w.distance_km ?? 0), 0);
          const vmax = Math.max(0, ...ws.map((w) => Number(w.max_speed_kmh ?? 0)));
          return (
            <div
              key={key}
              className="rounded-[var(--radius-md)] border p-3"
              style={{ background: tintedBackground(color, 0.7), borderColor: tint(color, 0.25) }}
            >
              <p className="flex items-center gap-2 text-sm text-[var(--color-heading)] dark:text-white">
                <span aria-hidden>{workoutEmoji(ws[0].type)}</span>
                {workoutDisplayLabel(ws[0].type)}
                <span className="text-[var(--color-body)]">
                  · {ws.length} séance{ws.length > 1 ? "s" : ""} · {fmtHM(minutes)}
                </span>
              </p>
              <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                <Mini label="Charge moy." value={load != null ? String(Math.round(load)) : "—"} />
                <Mini label="FC moy." value={hr != null ? `${Math.round(hr)} bpm` : "—"} />
                <Mini
                  label="Récup. 1 min"
                  value={drop != null ? `${drop >= 0 ? "−" : "+"}${Math.abs(Math.round(drop))} bpm` : "—"}
                />
                {dist > 0 && <Mini label="Distance" value={`${fr1(dist)} km`} />}
                {vmax > 0 && <Mini label="Vitesse max" value={`${fr1(vmax)} km/h`} />}
              </div>
            </div>
          );
        })}
        <p className="text-[10px] text-[var(--color-body)]">
          Récup. 1 min : baisse de FC dans la minute après la séance. À comparer d&apos;une période à l&apos;autre pour un même
          sport : une baisse plus forte signe une meilleure forme cardio.
        </p>
      </div>
    </ChartCard>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-[var(--color-body)]">{label}</p>
      <p className="text-[var(--color-heading)] dark:text-white tabular-nums">{value}</p>
    </div>
  );
}

// ── Récupération et nuit ─────────────────────────────────────────────────

function RecoveryTab({ data }: { data: StatsPayload }) {
  const m = data.dailyMetrics;
  const recovery = m.filter((d) => d.recovery_score != null).map((d) => ({ date: d.date, value: Number(d.recovery_score) }));
  const nights = m.filter((d) => d.sleep_total_min != null);
  const target = data.sleepTargetMin;
  const fullNights = nights.filter((n) => !isIncompleteNight(n.sleep_total_min));
  const durations = fullNights.map((n) => n.sleep_total_min!);
  const deep = avgOf(fullNights.map((n) => n.sleep_deep_pct));
  const rem = avgOf(fullNights.map((n) => n.sleep_rem_pct));

  // Régularité : écart-type de l'heure de coucher (23h et 1h restent voisins)
  const bedMinutes = m
    .map((d) => d.sleep_start)
    .filter((s): s is string => s != null)
    .map((iso) => {
      const [h, min] = new Date(iso)
        .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: data.tz, hour12: false })
        .split(":")
        .map(Number);
      const v = h * 60 + min;
      return v < 12 * 60 ? v + 24 * 60 : v;
    });
  const bedAvg = avgOf(bedMinutes);
  const bedSd =
    bedMinutes.length >= 3 && bedAvg != null
      ? Math.sqrt(bedMinutes.reduce((a, v) => a + (v - bedAvg) ** 2, 0) / bedMinutes.length)
      : null;
  const clock = (v: number) => {
    const x = Math.round(v) % (24 * 60);
    return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
  };

  return (
    <>
      {recovery.length > 0 && (
        <ChartCard title="Score de récupération">
          <ZonedLineChart kind="recovery" points={recovery} />
        </ChartCard>
      )}

      <ChartCard title="Mesures de la nuit · dans ta plage habituelle">
        <div className="space-y-5">
          {data.nightMetrics.map((nm) => (
            <NightMetricRow key={nm.key} metric={nm} data={data} />
          ))}
        </div>
      </ChartCard>

      {nights.length > 0 && (
        <ChartCard title="Sommeil">
          <HistoryChart
            mode="bar"
            height={200}
            points={nights.map((n) => ({ date: n.date, value: r1(n.sleep_total_min! / 60) }))}
            unit="h"
            decimals={1}
            target={{ value: target / 60, label: `objectif ${fmtHM(target)}` }}
          />
          <div className="mt-4">
            <StatGrid
              cols={4}
              items={[
                { label: "Moyenne", value: fmtHM(avgOf(durations)!) },
                { label: "Objectif atteint", value: `${durations.filter((d) => d >= target).length}/${durations.length}`, sub: "nuits" },
                { label: "Profond moy.", value: deep != null ? `${Math.round(deep)} %` : "—", sub: "vise ≥ 15 %" },
                { label: "REM moy.", value: rem != null ? `${Math.round(rem)} %` : "—", sub: "vise ≥ 20 %" },
              ]}
            />
          </div>
          {bedAvg != null && (
            <p className="text-xs text-[var(--color-body)] mt-3">
              Coucher moyen {clock(bedAvg)}
              {bedSd != null ? ` · régularité ±${Math.round(bedSd)} min (${bedSd < 30 ? "régulier" : "irrégulier"})` : ""} ·{" "}
              {bedMinutes.length} nuit{bedMinutes.length > 1 ? "s" : ""} avec horaires
            </p>
          )}
        </ChartCard>
      )}
    </>
  );
}

// Une mesure de la nuit : moyenne, nuits dans la plage, courbe sur la plage actuelle
function NightMetricRow({ metric, data }: { metric: NightMetric; data: StatsPayload }) {
  const def = BODY_METRICS_BY_KEY.get(metric.key)!;
  const points = metric.points.filter((p) => inPeriod(p.date, data.startDate, data.endDate));
  if (points.length === 0) return null;
  const withRange = points.filter((p) => p.status != null);
  const inRange = withRange.filter((p) => p.status === "in").length;
  const favorableOut = withRange.filter((p) => p.status !== "in" && isFavorable(def, p.status) === true).length;
  const last = [...points].reverse().find((p) => p.low != null && p.high != null);
  const avg = avgOf(points.map((p) => p.value))!;
  const share = withRange.length > 0 ? (inRange + favorableOut) / withRange.length : null;
  const color = share == null ? VIVID.gray : share >= 0.8 ? VIVID.green : share >= 0.6 ? VIVID.yellow : VIVID.orange;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-[var(--color-heading)] dark:text-white">
          {def.label}{" "}
          <span className="text-[var(--color-body)]">
            · moy. {formatMetric(def, avg)} {def.unit}
          </span>
        </p>
        <Link href={`/mesure/${def.key}`} className="text-xs text-[var(--color-brand-purple)] shrink-0">
          Détail ›
        </Link>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-[var(--color-body)] mt-0.5">
        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        {withRange.length > 0
          ? `${inRange}/${withRange.length} nuits dans ta plage${favorableOut > 0 ? `, ${favorableOut} hors plage dans le bon sens` : ""}`
          : `plage en cours de calcul (${def.minHistory} nuits nécessaires)`}
      </p>
      <HistoryChart
        height={140}
        points={points.map((p) => ({ date: p.date, value: p.value }))}
        unit={def.unit}
        decimals={def.decimals}
        band={last ? { low: last.low!, high: last.high! } : null}
      />
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

// Lundi de la semaine d'une date YYYY-MM-DD
function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function fmtMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
}

// Temps passé dans chaque zone pendant les séances (FC minute par minute).
// Par jour en vue semaine, par semaine en vue mois et année.
function ZonesChart({ workouts, period, tz }: { workouts: Workout[]; period: Period; tz: string }) {
  const measured = workouts.filter((w) => Array.isArray(w.hr_zone_min) && w.hr_zone_min.length === 5);
  const totals = [0, 0, 0, 0, 0];
  const buckets = new Map<string, number[]>();
  for (const w of measured) {
    const day = dateInTz(w.started_at, tz);
    const key = period === "week" ? day : mondayOf(day);
    const b = buckets.get(key) ?? [0, 0, 0, 0, 0];
    w.hr_zone_min!.forEach((m, i) => {
      b[i] += m;
      totals[i] += m;
    });
    buckets.set(key, b);
  }
  const grandTotal = totals.reduce((a, b) => a + b, 0);

  if (grandTotal === 0) {
    return (
      <ChartCard title="Zones cardio en séance">
        <p className="text-sm text-[var(--color-body)]">
          Aucune séance avec fréquence cardiaque sur la période (disponible depuis mai 2026).
        </p>
      </ChartCard>
    );
  }

  const chartData = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, z]) => ({
      label: period === "week" ? shortDateLabel(key) : `sem. ${shortDateLabel(key)}`,
      z1: z[0],
      z2: z[1],
      z3: z[2],
      z4: z[3],
      z5: z[4],
    }));

  return (
    <ChartCard title="Zones cardio en séance">
      {/* Répartition de la période, en minutes et en part du temps en zone */}
      <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px] mb-3" role="img" aria-label="Répartition du temps par zone">
        {ZONES.map((z, i) =>
          totals[i] > 0 ? (
            <div key={z.key} style={{ width: `${(totals[i] / grandTotal) * 100}%`, backgroundColor: z.color }} />
          ) : null,
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-1.5 mb-4">
        {ZONES.map((z, i) => (
          <div key={z.key} className="flex items-start gap-1.5 min-w-0">
            <span className="inline-block w-2.5 h-2.5 rounded-sm mt-0.5 shrink-0" style={{ backgroundColor: z.color }} />
            <div className="min-w-0">
              <p className="text-[11px] text-[var(--color-heading)] dark:text-white whitespace-nowrap">
                {z.label} {z.name}
              </p>
              <p className="text-[10px] text-[var(--color-body)] whitespace-nowrap tabular-nums">
                {fmtMinutes(totals[i])} · {Math.round((totals[i] / grandTotal) * 100)} %
              </p>
            </div>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-zinc-200, #e4e4e7)" opacity={0.5} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: C.zinc400 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: C.zinc400 }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(v: number) => fmtMinutes(v)}
          />
          <Tooltip
            cursor={{ fill: "rgba(100,116,141,0.08)" }}
            contentStyle={{
              backgroundColor: C.zinc800,
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 12,
            }}
            formatter={(val, name) => {
              const z = ZONES.find((zz) => zz.key === name);
              return [fmtMinutes(val as number), z ? `${z.label} ${z.name} (${z.range})` : String(name)];
            }}
          />
          {ZONES.map((z) => (
            <Bar
              key={z.key}
              dataKey={z.key}
              stackId="zones"
              fill={z.color}
              strokeWidth={2}
              className="stroke-white dark:stroke-[#0d1520]"
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-[var(--color-body)] mt-2">
        Minutes passées pendant les séances, en % de la FC max. La FC hors séance n&apos;est pas comptée.
      </p>
    </ChartCard>
  );
}

// ── Corps ────────────────────────────────────────────────────────────────

// Pente de la tendance (régression) en unité par semaine
function slopePerWeek(points: { date: string; value: number }[]): number | null {
  if (points.length < 3) return null;
  const xs = points.map((p) => Date.parse(`${p.date}T12:00:00Z`) / 86_400_000);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = points.reduce((a, p) => a + p.value, 0) / points.length;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += (x - mx) * (points[i].value - my);
    den += (x - mx) ** 2;
  });
  return den > 0 ? (num / den) * 7 : null;
}

// Sens d'une variation : couleur + mot (le poids seul ne dit pas si c'est bien)
function changeWord(change: number, better: "up" | "down" | "none"): React.ReactNode {
  if (Math.abs(change) < 0.2) return "stable";
  if (better === "none") return change > 0 ? "en hausse" : "en baisse";
  const good = (better === "up") === change > 0;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: good ? VIVID.green : VIVID.red }} />
      {good ? "dans le bon sens" : "dans le mauvais sens"}
    </span>
  );
}

// Poids, masse grasse et masse maigre : un graphique chacun (pas de double
// échelle), avec la tendance et la variation qu'elle donne sur la période
function BodyStats({ bodies }: { bodies: BodyComp[] }) {
  const pts = (key: "weight_kg" | "body_fat_pct" | "lean_mass_kg") =>
    bodies.filter((b) => b[key] != null).map((b) => ({ date: b.measured_at.slice(0, 10), value: Number(b[key]) }));
  const last = latestComposition(bodies);
  const metrics = [
    { title: "Poids", key: "weight_kg" as const, unit: "kg", color: VIVID.blue, better: "none" as const, changeUnit: "kg" },
    { title: "Masse grasse", key: "body_fat_pct" as const, unit: "%", color: FAT_COLOR, better: "down" as const, changeUnit: "%" },
    { title: "Masse maigre", key: "lean_mass_kg" as const, unit: "kg", color: LEAN_COLOR, better: "up" as const, changeUnit: "kg" },
  ];
  return (
    <>
      {last.leanKg && last.fatKg && (
        <ChartCard title={`Répartition · impédance du ${shortDateLabel(last.leanKg.date)}`}>
          <CompositionBar leanKg={last.leanKg.value} fatKg={last.fatKg.value} />
        </ChartCard>
      )}
      {metrics.map((m) => {
        const points = pts(m.key);
        const slope = slopePerWeek(points);
        const span =
          points.length >= 2
            ? (Date.parse(`${points[points.length - 1].date}T12:00:00Z`) - Date.parse(`${points[0].date}T12:00:00Z`)) / 86_400_000
            : 0;
        const change = slope != null ? (slope * span) / 7 : null;
        return (
          <ChartCard key={m.key} title={m.title}>
            <BodyTrendChart points={points} unit={m.unit} color={m.color} />
            {points.length > 0 && (
              <div className="mt-3">
                <StatGrid
                  items={[
                    { label: "Dernière", value: `${fr1(points[points.length - 1].value)} ${m.unit}` },
                    {
                      label: "Variation (tendance)",
                      value: change != null ? `${change > 0 ? "+" : change < 0 ? "−" : ""}${fr1(Math.abs(change))} ${m.changeUnit}` : "—",
                      sub: change != null ? changeWord(change, m.better) : "3 mesures minimum",
                    },
                    { label: "Mesures", value: String(points.length) },
                  ]}
                />
              </div>
            )}
          </ChartCard>
        );
      })}
    </>
  );
}
