// Sommeil : source unique des calculs (accueil, page Sommeil, stats,
// récupération, IA). Fonctions pures sur les lignes de daily_metrics.
//
// Ce que la montre mesure bien : durée totale, heures de coucher et de lever
// (donc la régularité). Ce qu'elle mesure mal : le sommeil profond
// (sous-estimé de 25 à 43 min, ~50 % des époques reconnues ; Schyvens 2025,
// Robbins 2024). Elle ne donne pas le temps au lit : ni efficacité ni latence.
//
// D'où le score /100, sur le modèle du Sleep Score d'Apple (watchOS 26) :
//   durée vs besoin 50 pts, régularité du coucher 30 pts, interruptions 20 pts.
// Les phases sont affichées en minutes, hors score. Le profond se compare à ta
// plage habituelle, jamais à une norme de laboratoire en % (ses minutes ne
// dépendent presque pas de la durée de la nuit ; Skorucak 2018).

import { VIVID } from "@/lib/palette";
import { isoDateMinusDays, localMidnightUtcIso } from "@/lib/dates";

export const DEFAULT_SLEEP_NEED_MIN = 450;

// Nuit plus courte que ça : probablement incomplète (montre retirée ou en
// charge). Elle est exclue des scores et des moyennes de sommeil.
export const MIN_NIGHT_MIN = 180;

export function isIncompleteNight(sleepTotalMin: number | null | undefined): boolean {
  return sleepTotalMin != null && sleepTotalMin < MIN_NIGHT_MIN;
}

// Sieste : session de sommeil de la journée, hors nuit principale
export type Nap = { start: string; end: string; min: number };

export type SleepRow = {
  date: string; // jour du lever
  sleep_total_min: number | null;
  sleep_rem_pct?: number | null;
  sleep_deep_pct?: number | null;
  sleep_awake_pct?: number | null;
  sleep_start?: string | null;
  sleep_end?: string | null;
  naps?: Nap[] | null;
};

// ── Petits outils ────────────────────────────────────────────────────────

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  return percentile([...values].sort((a, b) => a - b), 0.5);
}

// Minutes locales depuis minuit (0-1439)
function localMinutes(iso: string, tz: string): number | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return isNaN(h) || isNaN(m) ? null : h * 60 + m;
}

// Heure en minutes par rapport à minuit du jour du lever. Pivot unique à 18h :
// 23h37 → −23, 00h32 → 32 (un coucher avant et après minuit restent voisins).
function relativeToWakeMidnight(iso: string, tz: string): number | null {
  const m = localMinutes(iso, tz);
  if (m == null) return null;
  return m >= 18 * 60 ? m - 24 * 60 : m;
}

// "23h37" à partir de minutes relatives (négatives = veille)
export function formatClock(min: number): string {
  const x = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${Math.floor(x / 60)}h${String(x % 60).padStart(2, "0")}`;
}

export function formatDuration(min: number): string {
  const m = Math.round(min);
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

export function isCompleteNight(row: SleepRow): boolean {
  return row.sleep_total_min != null && !isIncompleteNight(row.sleep_total_min);
}

// ── Phases et horaires ──────────────────────────────────────────────────

export type NightPhases = {
  totalMin: number;
  deepMin: number | null;
  remMin: number | null;
  coreMin: number | null; // "léger" (Core d'Apple)
  awakeMin: number | null;
  remPct: number | null;
};

// Minutes de chaque phase (stockées en % du temps endormi)
export function nightPhases(row: SleepRow): NightPhases | null {
  const total = row.sleep_total_min;
  if (total == null) return null;
  const min = (pct: number | null | undefined) => (pct != null ? (pct * total) / 100 : null);
  const deepMin = min(row.sleep_deep_pct);
  const remMin = min(row.sleep_rem_pct);
  return {
    totalMin: total,
    deepMin,
    remMin,
    coreMin: deepMin != null && remMin != null ? Math.max(0, total - deepMin - remMin) : null,
    awakeMin: min(row.sleep_awake_pct),
    remPct: row.sleep_rem_pct ?? null,
  };
}

export function napMinutes(row: SleepRow): number {
  return (row.naps ?? []).reduce((a, n) => a + (n.min ?? 0), 0);
}

export type SleepWindow = { bed: number; wake: number; mid: number };

// Coucher, lever et milieu de nuit, en minutes par rapport à minuit du jour du lever
export function sleepWindow(row: SleepRow, tz: string): SleepWindow | null {
  if (!row.sleep_start || !row.sleep_end) return null;
  const bed = relativeToWakeMidnight(row.sleep_start, tz);
  const wake = localMinutes(row.sleep_end, tz);
  if (bed == null || wake == null) return null;
  return { bed, wake, mid: (bed + wake) / 2 };
}

// ── Plages personnelles (60 nuits complètes) ────────────────────────────

const MIN_RANGE_NIGHTS = 14;

// low / high : 10e et 90e percentiles (80 % des nuits habituelles)
export type PersonalRange = { median: number; low: number; high: number; q75: number; nights: number };

function rangeOf(values: number[]): PersonalRange | null {
  if (values.length < MIN_RANGE_NIGHTS) return null;
  const s = [...values].sort((a, b) => a - b);
  return { median: percentile(s, 0.5), low: percentile(s, 0.1), high: percentile(s, 0.9), q75: percentile(s, 0.75), nights: s.length };
}

export function deepRange(history: SleepRow[]): PersonalRange | null {
  return rangeOf(history.filter(isCompleteNight).map((r) => nightPhases(r)?.deepMin).filter((v): v is number => v != null));
}

export function remRange(history: SleepRow[]): PersonalRange | null {
  return rangeOf(history.filter(isCompleteNight).map((r) => nightPhases(r)?.remMin).filter((v): v is number => v != null));
}

export function awakeRange(history: SleepRow[]): PersonalRange | null {
  return rangeOf(history.filter(isCompleteNight).map((r) => nightPhases(r)?.awakeMin).filter((v): v is number => v != null));
}

// ── Score de la nuit (/100) ─────────────────────────────────────────────

export type ScoreComponent = { points: number; max: number; available: boolean };

export type SleepScore = {
  score: number; // 0-100
  label: string;
  color: string;
  duration: ScoreComponent & { sleptMin: number; needMin: number };
  regularity: ScoreComponent & { deviationMin: number | null; usualBed: number | null };
  interruptions: ScoreComponent & { awakeMin: number | null; usualMax: number | null };
  weakest: "duration" | "regularity" | "interruptions" | null;
};

const BANDS: { from: number; label: string; color: string }[] = [
  { from: 96, label: "Excellent", color: VIVID.green },
  { from: 81, label: "Bon", color: VIVID.green },
  { from: 61, label: "Correct", color: VIVID.yellow },
  { from: 41, label: "Faible", color: VIVID.orange },
  { from: 0, label: "Insuffisant", color: VIVID.red },
];

export function sleepScoreBand(score: number) {
  return BANDS.find((b) => score >= b.from) ?? BANDS[BANDS.length - 1];
}

// Régularité : plein jusqu'à 15 min d'écart avec ton coucher habituel
// (médiane des 13 nuits précédentes), 0 à 150 min (logique d'Apple)
const REG_FREE_MIN = 15;
const REG_ZERO_MIN = 150;
// Interruptions : plein jusqu'à ton éveil habituel (75e percentile, au moins
// 10 min ; la montre sous-compte l'éveil), puis −1 pt par 3 min
const AWAKE_FLOOR_MIN = 10;
const AWAKE_ZERO_EXTRA_MIN = 60;

export function sleepScore(night: SleepRow, history: SleepRow[], needMin: number, tz: string): SleepScore | null {
  if (!isCompleteNight(night)) return null;
  const phases = nightPhases(night)!;
  const prev = history.filter((r) => r.date < night.date && isCompleteNight(r)).sort((a, b) => a.date.localeCompare(b.date));

  // Durée : la nuit seule (les siestes comptent dans la dette)
  const slept = phases.totalMin;
  const duration = {
    points: 50 * clamp01((slept / needMin - 0.5) / 0.5),
    max: 50,
    available: true,
    sleptMin: slept,
    needMin,
  };

  // Régularité du coucher
  const bed = sleepWindow(night, tz)?.bed ?? null;
  const pastBeds = prev
    .slice(-13)
    .map((r) => sleepWindow(r, tz)?.bed)
    .filter((v): v is number => v != null);
  const usualBed = pastBeds.length >= 4 ? median(pastBeds) : null;
  const deviation = bed != null && usualBed != null ? Math.abs(bed - usualBed) : null;
  const regularity = {
    points: deviation != null ? 30 * clamp01(1 - Math.max(0, deviation - REG_FREE_MIN) / (REG_ZERO_MIN - REG_FREE_MIN)) : 0,
    max: 30,
    available: deviation != null,
    deviationMin: deviation != null ? Math.round(deviation) : null,
    usualBed,
  };

  // Interruptions : éveil de la nuit vs ton habitude
  const awake = phases.awakeMin;
  const usual = awakeRange(prev.slice(-60));
  const threshold = Math.max(AWAKE_FLOOR_MIN, usual?.q75 ?? 15);
  const interruptions = {
    points: awake != null ? 20 * clamp01(1 - Math.max(0, awake - threshold) / AWAKE_ZERO_EXTRA_MIN) : 0,
    max: 20,
    available: awake != null,
    awakeMin: awake != null ? Math.round(awake) : null,
    usualMax: Math.round(threshold),
  };

  // Composantes absentes : leur poids est redistribué
  const parts = [duration, regularity, interruptions].filter((c) => c.available);
  const score = Math.round((parts.reduce((a, c) => a + c.points, 0) / parts.reduce((a, c) => a + c.max, 0)) * 100);
  const band = sleepScoreBand(score);

  // Point faible : la composante qui perd la plus grande part de ses points
  const losses = (
    [
      ["duration", duration],
      ["regularity", regularity],
      ["interruptions", interruptions],
    ] as const
  )
    .filter(([, c]) => c.available && c.max - c.points >= c.max * 0.2)
    .sort(([, a], [, b]) => (b.max - b.points) / b.max - (a.max - a.points) / a.max);

  return { score, label: band.label, color: band.color, duration, regularity, interruptions, weakest: losses[0]?.[0] ?? null };
}

// Heure de coucher conseillée : ton heure habituelle (la régularité compte
// autant que la durée), avancée seulement si ton lever habituel ne laisse pas
// assez de temps pour ton besoin, et de 30 min de plus en cas de dette
// d'1 h ou plus. Jamais plus tard que l'heure habituelle. Arrondie à 5 min.
export function suggestedBedtime(history: SleepRow[], needMin: number, tz: string, debtMin = 0): number | null {
  const complete = history.filter(isCompleteNight).sort((a, b) => a.date.localeCompare(b.date));
  const beds = complete
    .slice(-13)
    .map((r) => sleepWindow(r, tz)?.bed)
    .filter((v): v is number => v != null);
  const recent = complete.slice(-7);
  const wakes = recent.map((r) => sleepWindow(r, tz)?.wake).filter((v): v is number => v != null);
  const awakes = recent.map((r) => nightPhases(r)?.awakeMin).filter((v): v is number => v != null);
  const usual = beds.length >= 4 ? median(beds) : null;
  const wake = median(wakes);
  const forNeed = wake != null ? wake - needMin - (median(awakes) ?? 0) : null;
  const base = usual != null && forNeed != null ? Math.min(usual, forNeed) : (usual ?? forNeed);
  if (base == null) return null;
  return Math.floor((base - (debtMin >= 60 ? 30 : 0)) / 5) * 5;
}

// Conseil du jour, tiré du point faible
export function sleepAdvice(s: SleepScore, bedtime: number | null): string {
  switch (s.weakest) {
    case "duration":
      return `Nuit courte : ${formatDuration(s.duration.sleptMin)} pour un besoin de ${formatDuration(s.duration.needMin)}.${
        bedtime != null ? ` Vise un coucher vers ${formatClock(bedtime)}.` : ""
      }`;
    case "regularity":
      return `Coucher décalé de ${s.regularity.deviationMin} min par rapport à ton heure habituelle${
        s.regularity.usualBed != null ? ` (${formatClock(s.regularity.usualBed)})` : ""
      }. La régularité compte autant que la durée.`;
    case "interruptions":
      return `Nuit plus hachée que d'habitude : ${s.interruptions.awakeMin} min d'éveil.`;
  }
  return s.score >= 81 ? "Durée, régularité et continuité au rendez-vous." : "Nuit correcte, sans point faible marqué.";
}

// ── Dette de sommeil (14 nuits) ─────────────────────────────────────────
// Heuristique (pas de norme validée) : Σ (besoin − sommeil − siestes),
// pondérée (demi-vie 7 jours : les nuits récentes comptent plus). Un surplus
// ne rembourse qu'1 h par nuit au plus : la récupération est partielle
// (Banks 2010, Belenky 2003). La dette s'accumule sans qu'on la ressente
// (Van Dongen 2003).

export const DEBT_DAYS = 14;
const DEBT_HALF_LIFE_DAYS = 7;
const MAX_REPAY_PER_NIGHT_MIN = 60;

export type SleepDebt = { debtMin: number; nights: number; nightsOnNeed: number; avgSleptMin: number | null };

export function sleepDebt(rows: SleepRow[], upTo: string, needMin: number): SleepDebt {
  const from = isoDateMinusDays(upTo, DEBT_DAYS - 1);
  const byDate = new Map(rows.map((r) => [r.date, r]));
  let debt = 0;
  let nights = 0;
  let onNeed = 0;
  let sleptSum = 0;
  for (let age = 0; age < DEBT_DAYS; age++) {
    const date = isoDateMinusDays(upTo, age);
    if (date < from) break;
    const r = byDate.get(date);
    if (!r || !isCompleteNight(r)) continue;
    const slept = r.sleep_total_min! + napMinutes(r);
    const deficit = needMin - slept;
    const contribution = deficit > 0 ? deficit : -Math.min(-deficit, MAX_REPAY_PER_NIGHT_MIN);
    debt += contribution * Math.pow(0.5, age / DEBT_HALF_LIFE_DAYS);
    nights++;
    sleptSum += slept;
    if (slept >= needMin) onNeed++;
  }
  return { debtMin: Math.max(0, Math.round(debt)), nights, nightsOnNeed: onNeed, avgSleptMin: nights > 0 ? sleptSum / nights : null };
}

// ── Régularité : Sleep Regularity Index (Phillips 2017) ─────────────────
// Probabilité d'être dans le même état (endormi/éveillé) à 24 h d'écart,
// ramenée sur 0-100 (100 = parfaitement régulier). Pas de 5 min, jours de
// midi à midi, siestes comprises. Repères UK Biobank (Windred 2024, n=60 977) :
// médiane 81 ; sous 72, le quintile le plus irrégulier, mortalité plus élevée.

export const SRI_DAYS = 14;
const EPOCH_MS = 5 * 60 * 1000;
const MIN_SRI_PAIRS = 6;

export function sleepRegularityIndex(rows: SleepRow[], upTo: string, tz: string, days = SRI_DAYS): number | null {
  const from = isoDateMinusDays(upTo, days - 1);
  const inWindow = rows.filter((r) => r.date >= from && r.date <= upTo);
  const intervals: [number, number][] = [];
  const valid = new Set<string>();
  for (const r of inWindow) {
    if (r.sleep_start && r.sleep_end && isCompleteNight(r)) {
      intervals.push([Date.parse(r.sleep_start), Date.parse(r.sleep_end)]);
      valid.add(r.date);
    }
    for (const n of r.naps ?? []) intervals.push([Date.parse(n.start), Date.parse(n.end)]);
  }
  // Période du jour D : de midi la veille à midi le jour D (contient la nuit de D)
  const periodStart = (date: string) => Date.parse(localMidnightUtcIso(isoDateMinusDays(date, 1), tz)) + 12 * 3_600_000;
  const DAY_MS = 24 * 3_600_000;
  // Intervalles qui touchent une période donnée (évite de tout parcourir sur un an)
  const near = (start: number) => intervals.filter(([s, e]) => e > start && s < start + DAY_MS);

  let same = 0;
  let total = 0;
  let pairs = 0;
  for (let age = days - 1; age >= 1; age--) {
    const d1 = isoDateMinusDays(upTo, age);
    const d2 = isoDateMinusDays(upTo, age - 1);
    if (!valid.has(d1) || !valid.has(d2)) continue;
    const s1 = periodStart(d1);
    const s2 = periodStart(d2);
    const i1 = near(s1);
    const i2 = near(s2);
    const asleep = (list: [number, number][], t: number) => list.some(([s, e]) => t >= s && t < e);
    for (let i = 0; i < DAY_MS / EPOCH_MS; i++) {
      if (asleep(i1, s1 + i * EPOCH_MS) === asleep(i2, s2 + i * EPOCH_MS)) same++;
      total++;
    }
    pairs++;
  }
  if (pairs < MIN_SRI_PAIRS || total === 0) return null;
  return Math.round(200 * (same / total) - 100);
}

// Écart-type de l'heure de coucher (information, en minutes)
export function bedtimeSpread(rows: SleepRow[], tz: string): number | null {
  const beds = rows
    .filter(isCompleteNight)
    .map((r) => sleepWindow(r, tz)?.bed)
    .filter((v): v is number => v != null);
  if (beds.length < 3) return null;
  const mean = beds.reduce((a, b) => a + b, 0) / beds.length;
  return Math.round(Math.sqrt(beds.reduce((a, v) => a + (v - mean) ** 2, 0) / beds.length));
}

// ── Couleurs ────────────────────────────────────────────────────────────

export function sriColor(sri: number): string {
  return sri >= 81 ? VIVID.green : sri >= 72 ? VIVID.yellow : VIVID.orange;
}

// Profond : jamais rouge (marge d'erreur de la montre). Sous ta plage = jaune.
export function deepMinutesColor(min: number, range: PersonalRange | null): string {
  if (!range) return VIVID.gray;
  return min < range.low ? VIVID.yellow : VIVID.green;
}

// Dette : sous 1 h négligeable, au-delà de 5 h marquée
export function debtColor(min: number): string {
  return min < 60 ? VIVID.green : min < 180 ? VIVID.yellow : min < 300 ? VIVID.orange : VIVID.red;
}

// ── Nuit transmise aux IA ───────────────────────────────────────────────
// Phases en minutes (le profond n'est jamais envoyé en %), nuit incomplète
// signalée : l'IA ne juge ni sa durée ni ses phases.
export function nightForAi<T extends SleepRow>(row: T) {
  const { sleep_deep_pct: _deepPct, sleep_awake_pct: _awakePct, naps: _naps, ...rest } = row;
  void _deepPct;
  void _awakePct;
  void _naps;
  const p = nightPhases(row);
  const r = (v: number | null | undefined) => (v != null ? Math.round(v) : null);
  return {
    ...rest,
    sleep_readable: row.sleep_total_min != null ? formatDuration(row.sleep_total_min) : null,
    sleep_incomplete: row.sleep_total_min != null && !isCompleteNight(row),
    sleep_deep_min: r(p?.deepMin),
    sleep_rem_min: r(p?.remMin),
    sleep_awake_min: r(p?.awakeMin),
    nap_min: napMinutes(row) || null,
  };
}
