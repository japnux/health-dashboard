// Composition corporelle : dernières valeurs, tendances et verdict selon
// l'objectif. Partagé par l'accueil, la page /corps et les statistiques.
//
// Poids : balance simple ou impédancemètre. Masse grasse et masse maigre :
// impédancemètre seulement, donc pris ensemble sur la dernière mesure qui
// les contient (une pesée simple plus récente ne les efface pas).

import type { BodyMeasurement, BodyTrend } from "@/lib/body-trend";
import type { Objective } from "@/lib/nutrition-calc";
import { VIVID } from "@/lib/palette";

export type Dated = { value: number; date: string };

export type CompositionSnapshot = {
  weight: Dated | null;
  fatPct: Dated | null;
  fatKg: Dated | null; // poids de la mesure d'impédance × % de gras
  leanKg: Dated | null;
};

// Tendances : régression sur 90 jours (l'impédance est mesurée ~1 fois par
// mois ; 60 jours donnait trop souvent moins de 3 points)
export const BODY_TREND_WINDOW = 90;

// Seuil sous lequel une tendance est "stable" : l'impédance est bruitée,
// 0,05 kg/sem ne veut rien dire
const STABLE = { weight: 0.1, fat: 0.1, lean: 0.1 };

export function latestComposition(bodies: BodyMeasurement[]): CompositionSnapshot {
  const sorted = [...bodies].sort((a, b) => b.measured_at.localeCompare(a.measured_at));
  const w = sorted.find((b) => b.weight_kg != null);
  const imp = sorted.find((b) => b.body_fat_pct != null && b.lean_mass_kg != null);
  const day = (b: BodyMeasurement) => b.measured_at.slice(0, 10);
  return {
    weight: w ? { value: Number(w.weight_kg), date: day(w) } : null,
    fatPct: imp ? { value: Number(imp.body_fat_pct), date: day(imp) } : null,
    fatKg:
      imp && imp.weight_kg != null
        ? { value: Math.round(Number(imp.weight_kg) * Number(imp.body_fat_pct)) / 100, date: day(imp) }
        : null,
    leanKg: imp ? { value: Number(imp.lean_mass_kg), date: day(imp) } : null,
  };
}

type Kind = "weight" | "fat" | "lean";

// Direction significative d'une tendance (au-delà du bruit)
function dir(trend: BodyTrend | null, kind: Kind): "up" | "down" | "flat" | null {
  if (!trend) return null;
  if (Math.abs(trend.slopePerWeek) < STABLE[kind]) return "flat";
  return trend.slopePerWeek > 0 ? "up" : "down";
}

/** Couleur d'une tendance selon l'objectif (vert = dans le bon sens). */
export function trendColor(kind: Kind, trend: BodyTrend | null, objective: Objective): string {
  const d = dir(trend, kind);
  if (d == null) return VIVID.gray;
  if (d === "flat") return kind === "weight" && objective === "cut" ? VIVID.yellow : VIVID.green;
  if (kind === "fat") return d === "down" ? VIVID.green : objective === "lean_bulk" ? VIVID.orange : VIVID.red;
  if (kind === "lean") return d === "up" ? VIVID.green : objective === "cut" ? VIVID.orange : VIVID.red;
  // Poids : dépend de l'objectif
  if (objective === "cut") return d === "down" ? VIVID.green : VIVID.orange;
  if (objective === "lean_bulk") return d === "up" && trend!.slopePerWeek <= 0.35 ? VIVID.green : VIVID.orange;
  return Math.abs(trend!.slopePerWeek) <= 0.25 ? VIVID.green : VIVID.orange;
}

export function formatSlope(trend: BodyTrend | null, unit: string, decimals = 1): string {
  if (!trend) return "tendance à venir";
  const v = trend.slopePerWeek;
  // Sous la précision affichée : "stable" plutôt que "+0,0"
  if (Math.abs(v) < 0.5 * 10 ** -decimals) return "→ stable";
  const arrow = v > 0 ? "↗" : "↘";
  return `${arrow} ${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(decimals).replace(".", ",")} ${unit}/sem`;
}

/** Verdict en une phrase, d'après les tendances masse maigre et masse grasse. */
export function compositionVerdict(
  trends: { weight: BodyTrend | null; fat: BodyTrend | null; lean: BodyTrend | null },
  objective: Objective,
): { text: string; color: string; label: string } {
  const lean = dir(trends.lean, "lean");
  const fat = dir(trends.fat, "fat");
  const weight = dir(trends.weight, "weight");

  if (lean == null || fat == null) {
    if (weight == null) return { text: "Pas encore assez de pesées pour dégager une tendance.", color: VIVID.gray, label: "à venir" };
    return {
      text:
        weight === "flat"
          ? "Poids stable. Pèse-toi sur l'impédancemètre pour suivre muscle et gras."
          : `Poids en ${weight === "up" ? "hausse" : "baisse"}. Pèse-toi sur l'impédancemètre pour savoir si c'est du muscle ou du gras.`,
      color: trendColor("weight", trends.weight, objective),
      label: weight === "flat" ? "stable" : weight === "up" ? "en hausse" : "en baisse",
    };
  }

  if (lean === "up" && fat === "down") return { text: "Recomposition en cours : tu gagnes du muscle et perds du gras.", color: VIVID.green, label: "recomposition" };
  if (lean === "up" && fat === "flat") return { text: "Tu gagnes de la masse maigre sans prendre de gras.", color: VIVID.green, label: "prise de muscle" };
  if (lean === "flat" && fat === "down") return { text: "Tu perds du gras en gardant ta masse maigre.", color: VIVID.green, label: "perte de gras" };
  if (lean === "flat" && fat === "flat") return { text: "Composition stable sur les 3 derniers mois.", color: VIVID.green, label: "stable" };
  if (lean === "up" && fat === "up")
    return {
      text: "Prise de masse : muscle et gras montent ensemble.",
      color: objective === "lean_bulk" ? VIVID.green : VIVID.orange,
      label: "prise de masse",
    };
  if (lean === "down" && fat === "down")
    return {
      text: "Tu perds du poids, muscle compris : attention aux protéines et à ne pas couper trop fort.",
      color: VIVID.orange,
      label: "perte de muscle",
    };
  if (lean === "down" && fat === "up")
    return { text: "Tu perds du muscle et prends du gras : vérifie protéines et volume d'entraînement.", color: VIVID.red, label: "à surveiller" };
  if (lean === "down") return { text: "Masse maigre en baisse : soigne les apports en protéines.", color: VIVID.orange, label: "muscle en baisse" };
  return { text: "Masse grasse en hausse, masse maigre stable.", color: VIVID.orange, label: "gras en hausse" };
}

// Couleurs de la répartition muscle / gras (barre de composition)
export const LEAN_COLOR = VIVID.cyan;
export const FAT_COLOR = VIVID.orange;
