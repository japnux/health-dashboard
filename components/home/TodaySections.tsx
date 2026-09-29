// Blocs de l'accueil : un résumé par sujet, le détail au clic.
// Composants serveur sans état.

import { deepMinutesColor, formatClock, formatDuration } from "@/lib/sleep";
import Link from "next/link";
import type { DashboardSnapshot } from "@/lib/dashboard-data";
import { recoveryColor, recoveryLabel } from "@/lib/recovery-score";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
import { strainColor } from "@/lib/strain-score";
import { BALANCE_ZONES, balanceZone } from "@/lib/load-balance";
import { FORM_ZONES, formZone } from "@/lib/form";
import { BODY_METRICS_BY_KEY, formatMetric, isFavorable } from "@/lib/body-metrics";
import { workoutDisplayLabel, normalizeWorkoutType, workoutEmoji } from "@/lib/workout-types";
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


// Phrase du jour : bâtie sur le niveau du Strain (mêmes seuils que la tuile)
// et sur la récupération, pour ne jamais contredire les libellés affichés
// dayDone : séance déjà faite et 18h passées (même règle que la séance suggérée),
// on ne pousse plus à s'entraîner
function heroText(color: string, strain: DashboardSnapshot["strain"], dayDone: boolean): string {
  const today = strain.mode === "hr" ? (strain.cardioLoad ?? 0) : strain.activeKcalToday;
  const ratio = strain.hasBaseline && strain.baselineAvg > 0 ? today / strain.baselineAvg : null;
  const times = ratio != null ? ` : ${ratio.toFixed(1).replace(".", ",")}× ta charge habituelle` : "";
  switch (strain.level) {
    case "very_high":
      return `Très grosse journée${times}. Place à la récupération ce soir : repas, hydratation, sommeil.`;
    case "high":
      return `Journée chargée${times}. Garde la suite légère et soigne ta nuit.`;
    case "moderate":
      if (dayDone) return "Journée active, dans ta moyenne. Séance faite : place à la récupération ce soir.";
      return color === "green"
        ? "Journée active, dans ta moyenne. Tu as encore de la marge si tu veux une séance de plus."
        : "Journée active, dans ta moyenne. Garde la suite de la journée légère.";
  }
  if (dayDone) return "Séance faite. Place à la récupération ce soir.";
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
  details,
}: {
  href: string;
  title: string;
  ring: React.ReactNode;
  status: string;
  statusColor: string;
  sub: string | null;
  // Chiffres clés en bas de tuile, sur grand écran (la tuile s'étire à la
  // hauteur de la carte voisine : on occupe la place)
  details?: TileDetail[];
}) {
  return (
    <Link href={href} className={`${CARD} !p-3 sm:!p-5 xl:!p-3.5 flex flex-col`} style={tinted(statusColor)}>
      <div className="flex items-center justify-center sm:justify-between xl:justify-center gap-1">
        <p className="text-[10px] sm:text-xs uppercase sm:tracking-wide text-[var(--color-body)] truncate">{title}</p>
        {/* Chevron masqué sur mobile : place pour le titre, la tuile entière reste cliquable */}
        <span className="hidden sm:inline xl:hidden">
          <Chevron />
        </span>
      </div>
      <div className="flex justify-center mt-3">{ring}</div>
      <p className="flex items-center justify-center gap-1.5 text-xs sm:text-sm text-[var(--color-heading)] dark:text-white mt-3 text-center">
        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
        {status}
      </p>
      {sub && <p className="text-[10px] sm:text-[11px] text-[var(--color-body)] mt-0.5 text-center leading-snug">{sub}</p>}
      {details && details.length > 0 && (
        <div className="hidden md:block mt-auto pt-4">
          <div className="pt-3 border-t border-black/5 dark:border-white/10 space-y-1.5">
            {details.map((d) => (
              <p key={d.label} className="flex items-center justify-between gap-1.5 text-[11px] xl:text-[10px] leading-tight">
                <span className="flex items-center gap-1.5 text-[var(--color-body)] min-w-0">
                  {d.color && <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />}
                  <span className="truncate">{d.label}</span>
                </span>
                <span className="text-[var(--color-heading)] dark:text-white tabular-nums whitespace-nowrap">{d.value}</span>
              </p>
            ))}
          </div>
        </div>
      )}
    </Link>
  );
}

type TileDetail = { label: string; value: string; color?: string };

// Mesures de la nuit pour la tuile Récupération : pastille verte dans la plage
// ou hors plage dans le bon sens, orange sinon
function nightMetricDetails(snap: DashboardSnapshot): TileDetail[] {
  const keys = ["hrv", snap.recovery.hrSource === "sleeping" ? "sleeping_hr" : null, "respiration"].filter(Boolean);
  return snap.bodyMetrics
    .filter((m) => keys.includes(m.key) && m.value != null)
    .map((m) => {
      const def = BODY_METRICS_BY_KEY.get(m.key)!;
      const favorable = m.status === "in" || isFavorable(def, m.status) === true;
      return {
        label: def.short,
        // Unité collée pour "/min" : la tuile est étroite en trois colonnes
        value: def.unit.startsWith("/") ? `${formatMetric(def, m.value!)}${def.unit}` : `${formatMetric(def, m.value!)} ${def.unit}`,
        color: m.status == null ? "#8e8e93" : favorable ? "#34c759" : "#ff9500",
      };
    });
}


export function TodayHero({ snap }: { snap: DashboardSnapshot }) {
  const color = recoveryColor(snap.recovery.score);
  const strain = snap.strain;
  const workoutsToday = snap.recentWorkouts.filter((w) => dateInTz(w.started_at, snap.tz) === snap.date).length;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: snap.tz }).format(new Date()));
  const dayDone = workoutsToday > 0 && hour >= 18;

  const t = snap.today;
  // Sommeil : anneau = score /100 (lib/sleep), durée au centre
  const sleepMin = t?.sleep_total_min ?? null;
  const night = snap.sleep.score;
  const sleepColor = night?.color ?? "#8e8e93";
  const sleepLabel = sleepMin != null ? formatDuration(sleepMin) : "—";
  const debt = snap.sleep.debt.debtMin;
  const phases = snap.sleep.phases;
  const todayWorkouts = snap.recentWorkouts.filter((w) => dateInTz(w.started_at, snap.tz) === snap.date);
  // Sous-titre du sommeil : le point faible, sinon la dette, sinon le score
  const WEAK = { duration: "nuit courte", regularity: "coucher décalé", interruptions: "nuit hachée" } as const;
  const sleepSub = night
    ? night.weakest
      ? WEAK[night.weakest]
      : debt >= 60
        ? `dette ${formatDuration(debt)}`
        : `${night.score}/100`
    : null;

  return (
    <>
      {/* Même marge haute que les titres de section : rangées alignées */}
      <p className="text-lg text-[var(--color-heading)] dark:text-white pt-2">
        {snap.recovery.score != null && snap.recovery.score >= 9 ? "Très bien récupéré" : RECOVERY_TITLE[color]}
      </p>
      {/* Phrase du jour : sous le titre sur mobile, sous les tuiles sur grand
          écran (les tuiles démarrent alors à la hauteur de la carte voisine) */}
      <p className="text-sm text-[var(--color-body)] leading-relaxed -mt-2 md:mt-0 md:order-last">{heroText(color, strain, dayDone)}</p>
      <div className="flex-1 grid grid-cols-3 gap-3 sm:gap-4">
        <ScoreTile
          href="/recuperation"
          title="Récupération"
          ring={<ScoreRing score={snap.recovery.score} color={RECOVERY_RING[color]} label="Récupération" size={76} />}
          status={snap.recovery.score != null ? capitalize(recoveryLabel(snap.recovery.score)) : "—"}
          statusColor={RECOVERY_RING[color]}
          sub={snap.recovery.basis !== "full" ? `score ${snap.recovery.basis === "partial" ? "partiel" : "estimé"}` : "nuit dernière"}
          details={nightMetricDetails(snap)}
        />
        <ScoreTile
          href="/strain"
          title="Strain"
          ring={<ScoreRing score={strain.score} color={strainColor(strain.score)} label="Strain" size={76} />}
          status={strain.label}
          statusColor={strainColor(strain.score)}
          sub={workoutsToday > 0 ? `${workoutsToday} séance${workoutsToday > 1 ? "s" : ""} aujourd'hui` : "aujourd'hui"}
          details={[
            ...(strain.mode === "hr" && strain.cardioLoad != null
              ? [
                  { label: "Charge", value: String(Math.round(strain.cardioLoad)) },
                  { label: "Moyenne", value: strain.hasBaseline ? String(strain.baselineAvg) : "—" },
                ]
              : [{ label: "Kcal actives", value: String(strain.activeKcalToday) }]),
            ...todayWorkouts.slice(0, 2).map((w) => ({
              label: `${workoutEmoji(w.type ?? "")} ${workoutDisplayLabel(w.type ?? "")}`,
              value: fmtDuration(w.duration_min),
            })),
          ]}
        />
        <ScoreTile
          href="/sommeil"
          title="Sommeil"
          ring={
            <ScoreRing
              score={null}
              progress={night ? night.score / 100 : 0}
              center={sleepLabel}
              color={sleepColor}
              label="Sommeil"
              size={76}
            />
          }
          status={night ? night.label : snap.sleep.incomplete ? "Incomplète" : "—"}
          statusColor={sleepColor}
          sub={sleepSub}
          details={[
            ...(snap.sleep.window ? [{ label: "Coucher", value: formatClock(snap.sleep.window.bed) }] : []),
            ...(phases?.deepMin != null
              ? [{ label: "Profond", value: `${Math.round(phases.deepMin)} min`, color: deepMinutesColor(phases.deepMin, snap.sleep.deepRange) }]
              : []),
            ...(phases?.remMin != null ? [{ label: "REM", value: formatDuration(phases.remMin) }] : []),
            ...(snap.sleep.suggestedBed != null ? [{ label: "Ce soir", value: formatClock(snap.sleep.suggestedBed) }] : []),
          ]}
        />
      </div>
    </>
  );
}

// ── Séances du jour ──

function fmtDuration(min: number | null): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

export function WorkoutsToday({ snap, title = "Séances du jour" }: { snap: DashboardSnapshot; title?: string | null }) {
  const workouts = snap.recentWorkouts
    .filter((w) => dateInTz(w.started_at, snap.tz) === snap.date)
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
  if (workouts.length === 0) return null;
  return (
    <>
      {title && <SectionTitle>{title}</SectionTitle>}
      <div className="space-y-3">
        {workouts.map((w) => (
          <Link key={w.id} href={`/seance/${w.id}`} className={CARD} style={tinted(sportColor(normalizeWorkoutType(w.type ?? "")))}>
            <div className="flex items-center gap-4">
              <span className="text-3xl" aria-hidden>
                {workoutEmoji(w.type ?? "")}
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
// Glyphe foncé sur les fonds clairs (jaune, vert anis) : le blanc y est illisible
const LIGHT_BADGES = new Set(["#ffcc00", "#a4de02", "#32ade6"]);

function StatusBadge({ good, color }: { good: boolean | null; color: string }) {
  const glyph = good === true ? "✓" : good === false ? "!" : "·";
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-[4px] text-[10px] font-semibold shrink-0"
      style={{ backgroundColor: color, color: LIGHT_BADGES.has(color.toLowerCase()) ? "#061b31" : "#ffffff" }}
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
    // Largeur fluide (le viewBox garde les proportions) : tient dans une tuile
    // étroite, en colonne sur grand écran comme sur mobile
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block w-[120px] sm:w-[140px] md:w-[120px] 2xl:w-[150px] h-auto overflow-visible shrink-0"
      aria-hidden
    >
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
      {/* Côte à côte, sauf en disposition trois colonnes (colonne étroite) : empilées */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
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
                <span className="text-[10px] text-[var(--color-body)]/80 mt-2 text-center leading-tight">
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
