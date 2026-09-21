// Forme d'entraînement (modèle forme / fatigue, « Training Stress Balance ») :
//   forme = charge chronique (EWMA 42 j) − charge aiguë (EWMA 7 j)
// Positive : tu es reposé par rapport à ton niveau. Négative : fatigue
// accumulée par l'entraînement récent.
//
// Les seuils de zone (+25 / +5 / −10 / −30) sont définis sur l'échelle TSS
// (TrainingPeaks), où 100 = une heure à ton seuil. La charge cardio du
// dashboard est convertie sur cette échelle : une heure au seuil (≈ 88 % de
// la FC max, approximation usuelle du seuil lactique) y vaut
// 60 × poids(88 %) = 228 points, d'où ÷ 2,28. Calibrage vérifié sur
// l'historique : mêmes valeurs que l'app de suivi de l'utilisateur à 1-3
// points près (hors un jour où les charges diffèrent).

import { VIVID } from "@/lib/palette";
import { intensityWeight } from "@/lib/cardio-load";
import type { LoadPoint } from "@/lib/load-balance";

const THRESHOLD_PCT_HR_MAX = 0.88;
// Le poids d'intensité ne dépend que du % de FC max : la FC max s'annule
export const FORM_SCALE = 100 / (60 * intensityWeight(THRESHOLD_PCT_HR_MAX, 1));

export type FormLevel = "detraining" | "fresh" | "neutral" | "optimal" | "high_risk";

export const FORM_ZONES: {
  level: FormLevel;
  from: number;
  to: number;
  color: string;
  label: string;
  long: string;
  advice: string;
}[] = [
  {
    level: "high_risk",
    from: -Infinity,
    to: -30,
    color: VIVID.red,
    label: "risque élevé",
    long: "fatigue excessive",
    advice:
      "La fatigue accumulée dépasse nettement ta forme de fond. Le risque de blessure et de surmenage augmente : lève le pied quelques jours.",
  },
  {
    level: "optimal",
    from: -30,
    to: -10,
    color: VIVID.green,
    label: "optimal",
    long: "entraînement optimal",
    advice:
      "Zone idéale pour un bloc d'entraînement : un peu de fatigue, c'est le signe que tu charges assez pour progresser.",
  },
  {
    level: "neutral",
    from: -10,
    to: 5,
    color: VIVID.lime,
    label: "neutre",
    long: "neutre",
    advice:
      "Ta charge récente est proche de ton niveau de fond : tu entretiens ta forme sans vraiment la faire progresser.",
  },
  {
    level: "fresh",
    from: 5,
    to: 25,
    color: VIVID.cyan,
    label: "frais",
    long: "frais, prêt à performer",
    advice:
      "Tu es reposé par rapport à ton niveau : bon moment pour une séance exigeante ou une compétition.",
  },
  {
    level: "detraining",
    from: 25,
    to: Infinity,
    color: VIVID.purple,
    label: "désentraînement",
    long: "désentraînement",
    advice:
      "Très reposé depuis un moment : ta forme de fond commence à baisser. Reprends progressivement.",
  },
];

export function formZone(form: number) {
  return FORM_ZONES.find((z) => form < z.to) ?? FORM_ZONES[FORM_ZONES.length - 1];
}

export type FormPoint = { date: string; form: number };

// Forme jour par jour à partir de la série de charge (même EWMA 7 j / 42 j
// que l'équilibre de charge), journée en cours comprise.
export function formSeries(series: LoadPoint[]): FormPoint[] {
  return series
    .filter((p) => p.ratio != null) // même historique minimal que le ratio
    .map((p) => ({ date: p.date, form: Math.round((p.chronic - p.acute) * FORM_SCALE) }));
}
