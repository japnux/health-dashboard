/**
 * Strain Score — charge d'entraînement du jour sur une échelle 0-10.
 *
 * Inspiré du modèle WHOOP :
 * - Échelle logarithmique : plus le strain monte, plus c'est dur d'aller plus haut
 * - Basé sur la charge cardiovasculaire (voir lib/cardio-load.ts), avec repli
 *   sur les kcal actives pour les jours sans FC exploitable (avant mai 2026)
 * - Personnalisé via baseline 30j
 *
 * Formule :
 *   ratio = charge_du_jour / baseline_avg   (charge cardio, ou kcal en repli)
 *   rawScore = ln(1 + ratio × k) / ln(1 + k_max) × 10
 *
 * Le ln() rend la progression logarithmique :
 * - Jusqu'à 6 : journée égale ou inférieure à ta moyenne
 * - Passer de 7 à 8 demande beaucoup plus d'effort
 * - Atteindre 9-10 = journée exceptionnelle (double session, compétition)
 *
 * Niveaux :
 *   0-3   → Léger (repos, marche)
 *   3-6   → Modéré (entraînement standard)
 *   6-8   → Élevé (session intense ou double)
 *   8-10  → Très élevé (compétition, effort exceptionnel)
 */

import { VIVID } from "@/lib/palette";

export type StrainResult = {
  score: number;          // 0-10, arrondi à 0.1
  level: "light" | "moderate" | "high" | "very_high";
  label: string;          // label FR pour affichage
  emoji: string;
  mode: "hr" | "kcal";    // source du calcul : charge cardio ou kcal actives
  cardioLoad: number | null;
  activeKcalToday: number;
  baselineAvg: number;    // baseline utilisée pour le calcul (même unité que mode)
  hasBaseline: boolean;   // true si assez de données historiques
};

// Journée telle que stockée dans daily_metrics
export type StrainDay = { active_kcal: number | null; cardio_load?: number | null };

const FALLBACK_BASELINE = 500; // kcal par défaut si pas assez de données
const MIN_DAYS_FOR_BASELINE = 3;
// Mode FC : au moins 7 jours avec une charge connue dans l'historique
const MIN_DAYS_HR = 7;

// Constante de forme logarithmique.
// k contrôle la "courbure" : plus k est grand, plus la courbe s'aplatit tôt.
// Avec k=6 : ratio 1.0 (jour = moyenne) = 6.0, ratio 2.0 (double) = 8.0, ratio 3.0 = 9.1
const K = 6;
// k_max : ratio maximum attendu (4× la baseline = journée extrême → score ~10)
const K_MAX = 4;

export function computeStrainScore(
  activeKcalToday: number,
  historicalActiveKcal: number[], // active_kcal des 30 derniers jours (hors aujourd'hui)
): StrainResult {
  // Filtrer les valeurs nulles/0 pour la baseline (jours sans données = pas de montre)
  const validDays = historicalActiveKcal.filter((v) => v > 0);
  const hasBaseline = validDays.length >= MIN_DAYS_FOR_BASELINE;
  const baselineAvg = hasBaseline
    ? validDays.reduce((a, b) => a + b, 0) / validDays.length
    : FALLBACK_BASELINE;

  // Ratio d'effort vs baseline
  const ratio = baselineAvg > 0 ? activeKcalToday / baselineAvg : 0;
  const score = logScore(ratio);
  const { level, label, emoji } = strainLevel(score);

  return {
    score,
    level,
    label,
    emoji,
    mode: "kcal",
    cardioLoad: null,
    activeKcalToday,
    baselineAvg: Math.round(baselineAvg),
    hasBaseline,
  };
}

// Strain d'une journée : charge cardio si le jour et l'historique en ont
// assez, sinon kcal actives. history = les ~30 jours précédents.
export function computeDayStrain(today: StrainDay, history: StrainDay[]): StrainResult {
  const loads = history
    .map((d) => d.cardio_load)
    .filter((v): v is number => v != null);
  const positive = loads.filter((v) => v > 0);

  if (
    today.cardio_load != null &&
    loads.length >= MIN_DAYS_HR &&
    positive.length >= MIN_DAYS_FOR_BASELINE
  ) {
    const baselineAvg = positive.reduce((a, b) => a + b, 0) / positive.length;
    const score = logScore(today.cardio_load / baselineAvg);
    const { level, label, emoji } = strainLevel(score);
    return {
      score,
      level,
      label,
      emoji,
      mode: "hr",
      cardioLoad: Math.round(today.cardio_load),
      activeKcalToday: today.active_kcal ?? 0,
      baselineAvg: Math.round(baselineAvg),
      hasBaseline: true,
    };
  }

  return computeStrainScore(
    today.active_kcal ?? 0,
    history.map((d) => d.active_kcal ?? 0),
  );
}

// Score logarithmique : ln(1 + ratio × K) / ln(1 + K_MAX × K) × 10
// ratio=0 → 0, ratio=1 → 6.0, ratio=2 → 8.0, ratio=4 → 10
function logScore(ratio: number): number {
  const maxLn = Math.log(1 + K_MAX * K);
  const rawScore = (Math.log(1 + ratio * K) / maxLn) * 10;
  return Math.round(Math.min(10, Math.max(0, rawScore)) * 10) / 10;
}

function strainLevel(score: number): { level: StrainResult["level"]; label: string; emoji: string } {
  if (score >= 8) return { level: "very_high", label: "Très élevé", emoji: "🔴" };
  if (score >= 6) return { level: "high", label: "Élevé", emoji: "🟠" };
  if (score >= 3) return { level: "moderate", label: "Modéré", emoji: "🟡" };
  return { level: "light", label: "Léger", emoji: "🟢" };
}

// Couleur CSS pour la jauge
export function strainColor(score: number): string {
  if (score >= 8) return VIVID.red;
  if (score >= 6) return VIVID.orange;
  if (score >= 3) return VIVID.yellow;
  return VIVID.green;
}
