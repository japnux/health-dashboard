// Couleurs de verdict des pavés de chiffres (statistiques et pages de détail).
// Vert : bon, jaune : moyen, orange : à surveiller, rouge : mauvais.
// Mêmes seuils partout pour qu'un chiffre ait toujours la même couleur.

import { VIVID } from "@/lib/palette";
import { isFavorable, metricStatus, type BodyMetricDef, type MetricRange } from "@/lib/body-metrics";

// Durée de sommeil contre l'objectif (tolérance de 45 min pour le jaune)
export function sleepDurationColor(min: number, targetMin: number): string {
  return min >= targetMin ? VIVID.green : min >= targetMin - 45 ? VIVID.yellow : VIVID.red;
}

// Sommeil profond : viser au moins 15 % de la nuit
export function deepSleepColor(pct: number): string {
  return pct >= 15 ? VIVID.green : pct >= 10 ? VIVID.yellow : VIVID.orange;
}

// Sommeil paradoxal (REM) : viser au moins 20 % de la nuit
export function remSleepColor(pct: number): string {
  return pct >= 20 ? VIVID.green : pct >= 15 ? VIVID.yellow : VIVID.orange;
}

// Régularité de l'heure de coucher (écart-type en minutes)
export function regularityColor(spreadMin: number): string {
  return spreadMin < 30 ? VIVID.green : spreadMin < 60 ? VIVID.yellow : VIVID.orange;
}

// Part de jours où un objectif est atteint (nuits à l'objectif, jours à 10 000 pas...)
export function shareColor(share: number): string {
  return share >= 0.7 ? VIVID.green : share >= 0.4 ? VIVID.yellow : VIVID.orange;
}

// Pas : objectif fixe de 10 000 par jour
export const STEPS_TARGET = 10_000;
export function stepsColor(steps: number): string {
  return steps >= STEPS_TARGET ? VIVID.green : steps >= 7_500 ? VIVID.yellow : VIVID.orange;
}

// Lumière du jour : viser au moins 2 h dehors par jour (rythme circadien)
export const DAYLIGHT_TARGET_MIN = 120;
export function daylightColor(min: number): string {
  return min >= DAYLIGHT_TARGET_MIN ? VIVID.green : min >= 60 ? VIVID.yellow : VIVID.orange;
}

// Score de récupération sur 10 (mêmes seuils que l'accueil)
export function recoveryValueColor(score: number): string {
  return score >= 7 ? VIVID.green : score >= 5 ? VIVID.yellow : VIVID.red;
}

// Mesure de la nuit contre ta plage habituelle : dans la plage ou hors plage
// dans le bon sens = vert, hors plage dans le mauvais sens = orange
export function metricValueColor(def: BodyMetricDef, value: number, range: MetricRange | null): string {
  const status = metricStatus(value, range, def.normalFrom);
  if (status == null) return VIVID.gray;
  if (status === "in") return VIVID.green;
  return isFavorable(def, status) ? VIVID.green : VIVID.orange;
}
