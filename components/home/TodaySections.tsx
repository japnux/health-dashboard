// Blocs de l'accueil : un résumé par sujet, le détail au clic.
// Composants serveur sans état.

import Link from "next/link";
import type { DashboardSnapshot } from "@/lib/dashboard-data";
import { recoveryColor } from "@/lib/recovery-score";
import { strainColor } from "@/lib/strain-score";
import { BALANCE_ZONES, balanceZone } from "@/lib/load-balance";
import { FORM_ZONES, formZone } from "@/lib/form";
import { BODY_METRICS_BY_KEY, formatMetric, isFavorable } from "@/lib/body-metrics";
import { workoutDisplayLabel, normalizeWorkoutType } from "@/lib/workout-types";
import { dateInTz } from "@/lib/dates";
import { ScoreRing } from "@/components/ScoreRing";
import { sportColor, tint, tintedBackground } from "@/lib/palette";

const CARD =
  "block rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5 hover:border-[var(--color-brand-purple)]/40 transition-colors";
const SHADOW = { boxShadow: "var(--shadow-ambient)" };
// Carte teintée par une couleur de statut (dégradé + bordure), comme l'app de référence
const tinted = (color: string, strength = 1) => ({
  ...SHADOW,
  background: tintedBackground(color, strength),
  borderColor: tint(color, 0.3),
});

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg text-[var(--color-heading)] dark:text-white pt-2">{children}</h2>;
}

function Chevron() {
  return (
    <span className="text-[var(--color-body)] text-lg leading-none" aria-hidden>
      ›
    </span>
  );
}

// ── En tête : récupération (nuit) et Strain (journée), une phrase d'action ──

const RECOVERY_RING: Record<string, string> = { green: "#34c759", yellow: "#ffcc00", red: "#ff3b30", gray: "#8e8e93" };
const RECOVERY_TITLE: Record<string, string> = {
  green: "Bien récupéré",
  yellow: "Récupération moyenne",
  red: "Récupération faible",
  gray: "Récupération inconnue",
};

const RECOVERY_LEVEL: Record<string, string> = { green: "Bonne", yellow: "Moyenne", red: "Faible", gray: "—" };

function heroText(color: string, strain: DashboardSnapshot["strain"]): string {
  const today = strain.mode === "hr" ? (strain.cardioLoad ?? 0) : strain.activeKcalToday;
  const ratio = strain.hasBaseline && strain.baselineAvg > 0 ? today / strain.baselineAvg : null;
  const fmt = (r: number) => r.toFixed(1).replace(".", ",");
  if (ratio != null && ratio >= 1.5) {
    return `Grosse journée : ${fmt(ratio)}× ta charge habituelle. Place à la récupération ce soir : repas, hydratation, sommeil.`;
  }
  if (ratio != null && ratio >= 0.7) {
    return color === "green"
      ? "Journée active, dans ta moyenne. Tu as encore de la marge si tu veux une séance de plus."
      : "Journée active, dans ta moyenne. Garde la suite de la journée légère.";
  }
  if (color === "green") return "Bon jour pour une séance exigeante.";
  if (color === "yellow") return "Une séance modérée passera bien ; évite l'intensité maximale.";
  if (color === "red") return "Privilégie une séance légère, de la mobilité ou du repos.";
  return "Pas encore de données de nuit : le score arrivera avec la prochaine synchro.";
}

// Tuile de score : titre, anneau, statut (pastille + libellé, jamais la couleur seule)
function ScoreTile({
  href,
  title,
  ring,
  status,
  statusColor,
  sub,
}: {
  href: string;
  title: string;
  ring: React.ReactNode;
  status: string;
  statusColor: string;
  sub: string | null;
}) {
  return (
    <Link href={href} className={`${CARD} !p-3 sm:!p-5 flex flex-col`} style={tinted(statusColor)}>
      <div className="flex items-center justify-center sm:justify-between gap-1">
        <p className="text-[10px] sm:text-xs uppercase sm:tracking-wide text-[var(--color-body)] truncate">{title}</p>
        {/* Chevron masqué sur mobile : place pour le titre, la tuile entière reste cliquable */}
        <span className="hidden sm:inline">
          <Chevron />
        </span>
      </div>
      <div className="flex justify-center mt-3">{ring}</div>
      <p className="flex items-center justify-center gap-1.5 text-xs sm:text-sm text-[var(--color-heading)] dark:text-white mt-3 text-center">
        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
        {status}
      </p>
      {sub && <p className="text-[10px] sm:text-[11px] text-[var(--color-body)] mt-0.5 text-center leading-snug">{sub}</p>}
    </Link>
  );
}

const SLEEP_QUALITY: Record<number, string> = { 10: "Excellent", 7: "Bon", 4: "Moyen", 1: "Insuffisant" };
const SLEEP_QUALITY_COLOR: Record<string, string> = { Excellent: "#34c759", Bon: "#34c759", Moyen: "#ffcc00", Insuffisant: "#ff3b30" };

export function TodayHero({ snap }: { snap: DashboardSnapshot }) {
  const color = recoveryColor(snap.recovery.score);
  const strain = snap.strain;
  const workoutsToday = snap.recentWorkouts.filter((w) => dateInTz(w.started_at, snap.tz) === snap.date).length;

  // Sommeil : anneau = durée rapportée à l'objectif, couleur = qualité
  const t = snap.today;
  const sleepMin = t?.sleep_total_min ?? null;
  const sleepScore = snap.recovery.components.sleep.available ? snap.recovery.components.sleep.score : null;
  const quality = sleepScore != null ? SLEEP_QUALITY[sleepScore] ?? null : null;
  const sleepColor = quality ? SLEEP_QUALITY_COLOR[quality] : "#8e8e93";
  const sleepLabel = sleepMin != null ? `${Math.floor(sleepMin / 60)}h${String(Math.round(sleepMin % 60)).padStart(2, "0")}` : "—";

  return (
    <>
      <div>
        <p className="text-lg text-[var(--color-heading)] dark:text-white">{RECOVERY_TITLE[color]}</p>
        <p className="text-sm text-[var(--color-body)] mt-1 leading-relaxed">{heroText(color, strain)}</p>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <ScoreTile
          href="/recuperation"
          title="Récupération"
          ring={<ScoreRing score={snap.recovery.score} color={RECOVERY_RING[color]} label="Récupération" size={76} />}
          status={RECOVERY_LEVEL[color]}
          statusColor={RECOVERY_RING[color]}
          sub={snap.recovery.basis !== "full" ? `score ${snap.recovery.basis === "partial" ? "partiel" : "estimé"}` : "nuit dernière"}
        />
        <ScoreTile
          href="/strain"
          title="Strain"
          ring={<ScoreRing score={strain.score} color={strainColor(strain.score)} label="Strain" size={76} />}
          status={strain.label}
          statusColor={strainColor(strain.score)}
          sub={workoutsToday > 0 ? `${workoutsToday} séance${workoutsToday > 1 ? "s" : ""} aujourd'hui` : "aujourd'hui"}
        />
        <ScoreTile
          href="/sommeil"
          title="Sommeil"
          ring={
            <ScoreRing
              score={null}
              progress={sleepMin != null ? sleepMin / snap.sleepTargetMin : 0}
              center={sleepLabel}
              color={sleepColor}
              label="Sommeil"
              size={76}
            />
          }
          status={quality ?? "—"}
          statusColor={sleepColor}
          sub={sleepMin != null ? `${Math.round((sleepMin / snap.sleepTargetMin) * 100)} % de l'objectif` : null}
        />
      </div>
    </>
  );
}

// ── Séances du jour ──

const WORKOUT_EMOJI: Record<string, string> = {
  surf: "🏄",
  musculation: "🏋️",
  yoga: "🧘",
  natation: "🏊",
  course: "🏃",
  marche: "🚶",
  rando: "🥾",
  vélo: "🚴",
  sauna: "🥵",
  tennis: "🎾",
};

function fmtDuration(min: number | null): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

export function WorkoutsToday({ snap }: { snap: DashboardSnapshot }) {
  const workouts = snap.recentWorkouts
    .filter((w) => dateInTz(w.started_at, snap.tz) === snap.date)
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
  if (workouts.length === 0) return null;
  return (
    <>
      <SectionTitle>Séances du jour</SectionTitle>
      <div className="space-y-3">
        {workouts.map((w) => (
          <Link key={w.id} href={`/seance/${w.id}`} className={CARD} style={tinted(sportColor(normalizeWorkoutType(w.type ?? "")))}>
            <div className="flex items-center gap-4">
              <span className="text-3xl" aria-hidden>
                {WORKOUT_EMOJI[normalizeWorkoutType(w.type ?? "")] ?? "💪"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-base text-[var(--color-heading)] dark:text-white">{workoutDisplayLabel(w.type ?? "Séance")}</p>
                <p className="text-xs text-[var(--color-body)]">
                  {new Date(w.started_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: snap.tz })} ·{" "}
                  {fmtDuration(w.duration_min)}
                  {w.avg_hr_bpm != null && ` · ${w.avg_hr_bpm} bpm moy.`}
                </p>
              </div>
              {w.cardio_load != null && (
                <div className="text-right">
                  <p className="text-lg font-light tabular-nums text-[var(--color-heading)] dark:text-white">
                    {Math.round(Number(w.cardio_load))}
                  </p>
                  <p className="text-[10px] text-[var(--color-body)]">charge</p>
                </div>
              )}
              <Chevron />
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

// ── Équilibre d'entraînement : ratio de charge et forme ──

type Zone = { level: string; from: number; to: number; color: string; long: string };

// Pictogramme de statut (toujours accompagné du libellé)
function StatusBadge({ good, color }: { good: boolean | null; color: string }) {
  const glyph = good === true ? "✓" : good === false ? "!" : "·";
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-[4px] text-[10px] font-semibold text-white shrink-0"
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {glyph}
    </span>
  );
}

// Mini-courbe sur fond de zones, dernier point mis en avant
function ZoneSparkline({
  series,
  zones,
  domain,
  highlight,
  width = 170,
  height = 64,
}: {
  series: { date: string; value: number }[];
  zones: Zone[];
  domain: [number, number];
  highlight: string[]; // zones à teinter (les autres restent neutres)
  width?: number;
  height?: number;
}) {
  if (series.length < 2) return null;
  const values = series.map((p) => p.value);
  const min = Math.min(domain[0], ...values);
  const max = Math.max(domain[1], ...values);
  const pad = 6;
  const x = (i: number) => pad + (i * (width - 2 * pad)) / (series.length - 1);
  const y = (v: number) => pad + ((max - v) * (height - 2 * pad)) / (max - min);
  const path = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const last = series[series.length - 1];
  const lastZone = zones.find((z) => last.value < z.to) ?? zones[zones.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-full overflow-visible shrink-0" aria-hidden>
      {zones
        .filter((z) => highlight.includes(z.level))
        .map((z) => {
          const top = y(Math.min(z.to, max));
          const bottom = y(Math.max(z.from, min));
          return <rect key={z.level} x={0} width={width} y={top} height={Math.max(0, bottom - top)} fill={z.color} fillOpacity={0.18} rx={4} />;
        })}
      <path d={path} fill="none" stroke="#8e8e93" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(series.length - 1)} cy={y(last.value)} r={8} fill={lastZone.color} fillOpacity={0.3} />
      <circle cx={x(series.length - 1)} cy={y(last.value)} r={4} className="fill-[var(--color-heading)] dark:fill-white" stroke={lastZone.color} strokeWidth={2} />
    </svg>
  );
}

function ZoneTile({
  href,
  title,
  value,
  zone,
  good,
  sparkline,
}: {
  href: string;
  title: string;
  value: string;
  zone: Zone;
  good: boolean | null;
  sparkline: React.ReactNode;
}) {
  return (
    <Link href={href} className={CARD} style={tinted(zone.color)}>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-[var(--color-body)]">{title}</p>
        <Chevron />
      </div>
      <div className="flex items-center justify-between gap-4 mt-2">
        <p className="text-4xl font-light text-[var(--color-heading)] dark:text-white">{value}</p>
        {sparkline}
      </div>
      <p className="flex items-center gap-1.5 mt-2 text-[11px] uppercase tracking-wide text-[var(--color-heading)] dark:text-white">
        <StatusBadge good={good} color={zone.color} />
        {zone.long}
      </p>
    </Link>
  );
}

export function fmtForm(v: number): string {
  return v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0";
}

export function TrainingBalance({ snap }: { snap: DashboardSnapshot }) {
  const lb = snap.loadBalance;
  const form = snap.form;
  if (!lb && !form) return null;
  return (
    <>
      <SectionTitle>Équilibre d&apos;entraînement</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {lb && (
          <ZoneTile
            href="/charge"
            title="Ratio de charge"
            value={lb.ratio.toFixed(2).replace(".", ",")}
            zone={balanceZone(lb.ratio)}
            good={lb.level === "balanced" ? true : lb.level === "low" ? null : false}
            sparkline={
              <ZoneSparkline
                series={lb.series.map((p) => ({ date: p.date, value: p.ratio }))}
                zones={BALANCE_ZONES}
                domain={[0.4, 1.7]}
                highlight={["balanced", "rising", "spike"]}
              />
            }
          />
        )}
        {form && (
          <ZoneTile
            href="/forme"
            title="Forme d'entraînement"
            value={fmtForm(form.value)}
            zone={formZone(form.value)}
            good={form.level === "optimal" || form.level === "fresh" ? true : form.level === "high_risk" ? false : null}
            sparkline={
              <ZoneSparkline series={form.series} zones={FORM_ZONES} domain={[-40, 30]} highlight={["optimal"]} />
            }
          />
        )}
      </div>
    </>
  );
}

// ── Mesures corporelles de la nuit ──

const METRIC_ICON: Record<string, string> = {
  sleeping_hr: "❤️",
  hrv: "💓",
  wrist_temp: "🌡️",
  respiration: "🫁",
  spo2: "🩸",
};

// Barre de plage : zone normale en vert, repère sur la valeur
function RangeBar({ value, low, high, color }: { value: number; low: number; high: number; color: string }) {
  const span = high - low;
  const min = Math.min(low - span * 0.6, value);
  const max = Math.max(high + span * 0.6, value);
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className="relative h-1.5 w-full rounded-full bar-track mt-3">
      <div className="absolute h-full rounded-full bg-[#34c759]/60" style={{ left: `${pct(low)}%`, width: `${pct(high) - pct(low)}%` }} />
      <div
        className="absolute -top-[3px] w-3 h-3 rounded-full ring-2 ring-white dark:ring-[#0d1520]"
        style={{ left: `calc(${pct(value)}% - 6px)`, backgroundColor: color }}
      />
    </div>
  );
}

export function BodyMetricsRow({ snap }: { snap: DashboardSnapshot }) {
  if (snap.bodyMetrics.every((m) => m.value == null)) return null;
  return (
    <>
      <SectionTitle>Mesures corporelles</SectionTitle>
      <div className="grid grid-cols-5 gap-2 sm:gap-3">
        {snap.bodyMetrics.map((m) => {
          const def = BODY_METRICS_BY_KEY.get(m.key)!;
          const favorable = isFavorable(def, m.status);
          const color = m.status === "in" || favorable === true ? "#34c759" : favorable === false ? "#ff9500" : "#8e8e93";
          return (
            <Link
              key={m.key}
              href={`/mesure/${m.key}`}
              className="flex flex-col items-center rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 px-1.5 py-3 hover:border-[var(--color-brand-purple)]/40 transition-colors"
              style={tinted(color, 0.8)}
            >
              <span className="text-base" aria-hidden>
                {METRIC_ICON[m.key]}
              </span>
              <span className="text-xl sm:text-2xl font-light tabular-nums text-[var(--color-heading)] dark:text-white mt-1">
                {m.value != null ? formatMetric(def, m.value) : "—"}
              </span>
              <span className="text-[10px] text-[var(--color-body)]">{def.unit}</span>
              {m.value != null && m.range ? (
                <RangeBar value={m.value} low={m.range.low} high={m.range.high} color={color} />
              ) : (
                <span className="text-[9px] text-[var(--color-body)]/70 mt-2 text-center leading-tight">
                  réf. {m.history}/{def.minHistory} nuits
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}
