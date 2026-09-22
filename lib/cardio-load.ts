/**
 * Charge cardio : base du Strain calculé à partir de la fréquence cardiaque.
 *
 * Méthode d'Edwards (TRIMP par zones) avec une pondération continue :
 * chaque minute compte selon son intensité en % de la FC max,
 *   < 50 % → 0, 60 % → 1, 70 % → 2, 80 % → 3, 90 % → 4, 100 % → 5.
 * La version continue évite les sauts de palier (une heure à 89 bpm qui
 * compterait 0 et une à 90 bpm qui compterait 60).
 *
 * Charge du jour = charge des séances (FC minute par minute)
 *                + charge de fond (FC moyenne horaire, hors heures de séance).
 *
 * Tout est croisé en temps absolu (UTC) : les exports Health Auto Export
 * sont en heure locale du téléphone, qui change en voyage (+0100 / +0200).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

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

export function backgroundLoad(hourly: HrHourly, busyHours: Set<number>, hrMax: number): number {
  let load = 0;
  hourly.avg.forEach((avg, h) => {
    if (avg == null || busyHours.has(h)) return;
    load += 60 * intensityWeight(avg, hrMax);
  });
  return load;
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

// Recalcule la charge du jour à partir de la FC horaire stockée et des
// séances en base. Appelé après chaque envoi (métriques ou séances), car
// les deux arrivent dans des requêtes séparées, dans un ordre quelconque.
export async function recomputeDailyLoad(
  supabase: Client,
  date: string,
  hrMax: number,
): Promise<string | null> {
  const { data: row, error } = await supabase
    .from("daily_metrics")
    .select("hr_hourly")
    .eq("date", date)
    .maybeSingle();
  if (error) return `cardio_load ${date}: erreur lecture ${error.message}`;

  const hourly = row?.hr_hourly as HrHourly | null | undefined;
  if (!hourly?.start || !Array.isArray(hourly.avg)) return null;

  const dayStart = new Date(hourly.start).getTime();
  const dayEnd = dayStart + 24 * HOUR_MS;

  const { data: workouts, error: wError } = await supabase
    .from("workouts")
    .select("started_at, duration_min, cardio_load")
    .gte("started_at", new Date(dayStart).toISOString())
    .lt("started_at", new Date(dayEnd).toISOString());
  if (wError) return `cardio_load ${date}: erreur séances ${wError.message}`;

  // Heures couvertes par une séance mesurée : leur charge vient des données
  // minute par minute de la séance, pas de la moyenne horaire.
  const busy = new Set<number>();
  let workoutsLoad = 0;
  for (const w of workouts ?? []) {
    if (w.cardio_load == null) continue;
    workoutsLoad += Number(w.cardio_load);
    const s = new Date(w.started_at).getTime();
    const e = s + (w.duration_min ?? 0) * 60 * 1000;
    for (let h = 0; h < 24; h++) {
      const hs = dayStart + h * HOUR_MS;
      if (s < hs + HOUR_MS && e > hs) busy.add(h);
    }
  }

  const total = Math.round((workoutsLoad + backgroundLoad(hourly, busy, hrMax)) * 10) / 10;

  const { error: uError } = await supabase
    .from("daily_metrics")
    .update({ cardio_load: total })
    .eq("date", date);
  if (uError) return `cardio_load ${date}: erreur écriture ${uError.message}`;

  return `cardio_load ${date}: ${total} (séances ${Math.round(workoutsLoad)})`;
}
