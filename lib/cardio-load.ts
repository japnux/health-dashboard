/**
 * Charge cardio : base du Strain calculé à partir de la fréquence cardiaque.
 *
 * Méthode d'Edwards (TRIMP par zones) avec une pondération continue :
 * chaque minute compte selon son intensité en % de la FC max,
 *   < 50 % → 0, 60 % → 1, 70 % → 2, 80 % → 3, 90 % → 4, 100 % → 5.
 * La version continue évite les sauts de palier (une heure à 89 bpm qui
 * compterait 0 et une à 90 bpm qui compterait 60).
 *
 * Deux usages, deux définitions :
 * - Charge d'entraînement (ratio de charge, forme, graphique "Charge par
 *   jour") : les séances seulement, voir sessionLoadRows. C'est la méthode
 *   standard pour le risque de blessure ; la marche du quotidien n'y entre pas.
 * - Charge de la journée (Strain, colonne daily_metrics.cardio_load) :
 *   séances + activité hors séances, estimée à partir des kcal actives de la
 *   montre (plus stables que la FC horaire, qui comptait tout ou rien).
 *
 * Tout est croisé en temps absolu (UTC) : les exports Health Auto Export
 * sont en heure locale du téléphone, qui change en voyage (+0100 / +0200).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { dateInTz, isoDateMinusDays, localMidnightUtcIso } from "@/lib/dates";
import { getUserTz } from "@/lib/user-tz";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

// Points de charge par kcal active, calibrés sur l'historique (mai-sept. 2026) :
// hors séances, 0,08 garde la même charge moyenne qu'avec la FC horaire ;
// en séance, 0,24 (effort plus intense par kcal), sert à estimer les kcal
// d'une séance qui n'en a pas.
export const BACKGROUND_LOAD_PER_KCAL = 0.08;
const SESSION_LOAD_PER_KCAL = 0.24;

type Client = SupabaseClient<Database>;

// FC horaire d'une journée : minuit local exprimé en UTC + 24 moyennes.
// Un jour de changement d'heure a 23 ou 25 heures : l'index peut alors être
// décalé d'une heure pour la détection des heures de séance (2 jours/an).
export type HrHourly = { start: string; avg: (number | null)[] };

const HOUR_MS = 60 * 60 * 1000;
const FALLBACK_HR_MAX = 190;

export function intensityWeight(hr: number, hrMax: number): number {
  return Math.max(0, Math.min(5, (hr / hrMax - 0.5) * 10));
}

// Charge et minutes par zone d'une séance, à partir des points minute par
// minute de Health Auto Export ({ Avg, Max, Min, date }).
export function workoutLoad(
  points: unknown[],
  hrMax: number,
): { load: number; zoneMin: number[] } | null {
  const values = points
    .map((p) => Number((p as Record<string, unknown>).Avg))
    .filter((v) => !isNaN(v) && v > 0);
  if (values.length === 0) return null;

  const zoneMin = [0, 0, 0, 0, 0]; // 50-60, 60-70, 70-80, 80-90, 90-100 % FC max
  let load = 0;
  for (const hr of values) {
    load += intensityWeight(hr, hrMax);
    const pct = hr / hrMax;
    if (pct >= 0.5) zoneMin[Math.min(4, Math.floor((pct - 0.5) * 10))]++;
  }
  return { load: Math.round(load * 10) / 10, zoneMin };
}

// "2026-07-20 11:00:00 +0100" → minuit local de ce jour, en ISO UTC.
export function localMidnightUtc(dateStr: string): string | null {
  const m = dateStr.match(/^(\d{4}-\d{2}-\d{2}) \d{2}:\d{2}:\d{2} ?([+-])(\d{2}):?(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}T00:00:00${m[2]}${m[3]}:${m[4]}`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// FC de sommeil : plus basse moyenne horaire parmi les heures passées au
// moins 30 min dans la fenêtre de sommeil (coucher → lever). Null sous 3 heures.
export function sleepingHrFromHourly(
  windowStart: number,
  windowEnd: number,
  hourly: { t: number; avg: number }[],
): number | null {
  const inWindow = hourly.filter(
    (h) => Math.min(windowEnd, h.t + HOUR_MS) - Math.max(windowStart, h.t) >= HOUR_MS / 2,
  );
  if (inWindow.length < 3) return null;
  return Math.round(Math.min(...inWindow.map((h) => h.avg)));
}

// FC max : formule de Tanaka (208 − 0,7 × âge), relevée si des séances l'ont
// dépassée. Garde-fous contre les artefacts du capteur : valeurs au-delà de
// 210 ignorées, et il faut deux séances pour relever (la 2ᵉ plus haute FC
// max observée). Une seule pointe aberrante ne fausse plus toute la charge.
const HR_MAX_CEILING = 210;

export async function getHrMax(supabase: Client): Promise<number> {
  const [{ data: config }, { data: top }] = await Promise.all([
    supabase.from("dashboard_config").select("user_age").eq("id", 1).maybeSingle(),
    supabase
      .from("workouts")
      .select("max_hr_bpm")
      .not("max_hr_bpm", "is", null)
      .lte("max_hr_bpm", HR_MAX_CEILING)
      .order("max_hr_bpm", { ascending: false })
      .limit(2),
  ]);
  const age = config?.user_age ?? null;
  const theoretical = age != null ? 208 - 0.7 * age : FALLBACK_HR_MAX;
  const confirmed = top && top.length >= 2 ? Number(top[1].max_hr_bpm) : 0;
  return Math.round(Math.max(theoretical, confirmed));
}

// Recalcule la charge de la journée (Strain) : séances + hors séances estimé
// par les kcal actives. Appelé après chaque envoi (métriques ou séances), car
// les deux arrivent dans des requêtes séparées, dans un ordre quelconque.
export async function recomputeDailyLoad(supabase: Client, date: string): Promise<string | null> {
  const tz = await getUserTz(supabase);
  const { data: row, error } = await supabase.from("daily_metrics").select("active_kcal").eq("date", date).maybeSingle();
  if (error) return `cardio_load ${date}: erreur lecture ${error.message}`;
  if (!row) return null;

  const { data: workouts, error: wError } = await supabase
    .from("workouts")
    .select("cardio_load, kcal")
    .gte("started_at", localMidnightUtcIso(date, tz))
    .lt("started_at", localMidnightUtcIso(nextDay(date), tz));
  if (wError) return `cardio_load ${date}: erreur séances ${wError.message}`;

  let sessionsLoad = 0;
  let sessionsKcal = 0;
  for (const w of workouts ?? []) {
    const load = w.cardio_load != null ? Number(w.cardio_load) : 0;
    sessionsLoad += load;
    // kcal de la séance, estimées depuis sa charge si la montre ne les a pas envoyées
    sessionsKcal += w.kcal != null ? Number(w.kcal) : load / SESSION_LOAD_PER_KCAL;
  }
  if (row.active_kcal == null && (workouts ?? []).length === 0) return null;

  const background = Math.max(0, Number(row.active_kcal ?? 0) - sessionsKcal) * BACKGROUND_LOAD_PER_KCAL;
  const total = Math.round((sessionsLoad + background) * 10) / 10;

  const { error: uError } = await supabase.from("daily_metrics").update({ cardio_load: total }).eq("date", date);
  if (uError) return `cardio_load ${date}: erreur écriture ${uError.message}`;

  return `cardio_load ${date}: ${total} (séances ${Math.round(sessionsLoad)})`;
}

// Charge d'entraînement par jour : somme des charges des séances, jours
// locaux de `from` à `to`. Un jour sans séance est absent (il compte 0).
export async function sessionLoadRows(
  supabase: Client,
  from: string,
  to: string,
  tz: string,
): Promise<{ date: string; cardio_load: number }[]> {
  const rows = await fetchAllRows<{ started_at: string; cardio_load: number | null }>((a, b) =>
    supabase
      .from("workouts")
      .select("started_at, cardio_load")
      .not("cardio_load", "is", null)
      .gte("started_at", localMidnightUtcIso(from, tz))
      .lt("started_at", localMidnightUtcIso(nextDay(to), tz))
      .order("started_at", { ascending: true })
      .range(a, b),
  );
  return sessionLoadByDay(rows, tz);
}

// Regroupe des séances par jour local : { date, cardio_load = somme }
export function sessionLoadByDay(
  workouts: { started_at: string; cardio_load: number | null }[],
  tz: string,
): { date: string; cardio_load: number }[] {
  const byDate = new Map<string, number>();
  for (const w of workouts) {
    if (w.cardio_load == null) continue;
    const d = dateInTz(w.started_at, tz);
    byDate.set(d, (byDate.get(d) ?? 0) + Number(w.cardio_load));
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, load]) => ({ date, cardio_load: Math.round(load * 10) / 10 }));
}

function nextDay(date: string): string {
  return isoDateMinusDays(date, -1);
}
