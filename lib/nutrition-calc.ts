/**
 * Calcul centralisé des objectifs nutritionnels quotidiens.
 *
 * Le calcul dépend de :
 * - l'objectif (recomposition, lean_bulk, cut, maintenance)
 * - le TDEE / BMR (configurés dans les paramètres)
 * - le poids corporel (pour les protéines)
 * - le type de journée (training vs repos)
 *
 * Utilisé par : dashboard-data, nutrition/page, ai-analysis, ai-insights, SettingsForm.
 */

// ─── Types ──────────────────────────────────────────────────────────

export type Objective = "recomposition" | "lean_bulk" | "cut" | "maintenance";

export type MacroTargets = {
  calories: number;
  proteines_g: number;
  glucides_g: number;
  lipides_g: number;
};

export type ObjectiveConfig = {
  label: string;
  /** Delta kcal les jours d'entraînement */
  trainingDelta: number;
  /** Delta kcal les jours de repos */
  restDelta: number;
  /** Protéines en g par kg de poids corporel */
  proteinPerKg: number;
  /** % des calories alloué aux lipides */
  fatPct: number;
};

// ─── Configuration par objectif ─────────────────────────────────────

export const OBJECTIVE_CONFIGS: Record<Objective, ObjectiveConfig> = {
  recomposition: {
    label: "Recomposition",
    trainingDelta: 150,
    restDelta: -200,
    proteinPerKg: 2.2,
    fatPct: 0.28,
  },
  lean_bulk: {
    label: "Lean bulk",
    trainingDelta: 300,
    restDelta: 100,
    proteinPerKg: 2.0,
    fatPct: 0.24,
  },
  cut: {
    label: "Sèche",
    trainingDelta: -100,
    restDelta: -400,
    proteinPerKg: 2.4,
    fatPct: 0.30,
  },
  maintenance: {
    label: "Maintenance",
    trainingDelta: 0,
    restDelta: 0,
    proteinPerKg: 1.8,
    fatPct: 0.28,
  },
};

export const VALID_OBJECTIVES = Object.keys(OBJECTIVE_CONFIGS) as Objective[];

/** Normalise une string en Objective, fallback maintenance */
export function parseObjective(raw: string | null | undefined): Objective {
  if (raw && VALID_OBJECTIVES.includes(raw as Objective)) return raw as Objective;
  return "maintenance";
}

// ─── Calcul des macros de base ──────────────────────────────────────

export type ComputeBaseParams = {
  objective: Objective;
  tdee: number;
  weightKg: number;
  isTrainingDay: boolean;
};

/**
 * Calcule les macros de base pour un jour donné.
 * Pas d'ajustement temps réel ici — juste l'objectif statique.
 */
export function computeBaseTargets(params: ComputeBaseParams): MacroTargets {
  const cfg = OBJECTIVE_CONFIGS[params.objective];
  const delta = params.isTrainingDay ? cfg.trainingDelta : cfg.restDelta;
  const calories = Math.round(params.tdee + delta);

  const proteines_g = Math.round(params.weightKg * cfg.proteinPerKg);
  const lipides_g = Math.round((calories * cfg.fatPct) / 9);
  const carbKcal = calories - proteines_g * 4 - lipides_g * 9;
  const glucides_g = Math.max(50, Math.round(carbKcal / 4)); // plancher 50g

  return { calories, proteines_g, glucides_g, lipides_g };
}

// ─── Ajustement temps réel (workout intraday) ───────────────────────

export type AdjustParams = {
  baseTargets: MacroTargets;
  objective: Objective;
  bmr: number;
  tdee: number;
  activeKcalToday: number;
  estimatedRemainingKcal: number;
  isTrainingDay: boolean;
};

export type AdjustedResult = {
  /** Objectif calories ajusté */
  calories: number;
  /** Glucides ajustés (absorbent la diff) */
  glucides_g: number;
  /** TDEE ajusté = BMR + activité réelle + workouts restants */
  adjustedTdee: number;
};

/**
 * Ajuste les calories et glucides en temps réel selon l'activité mesurée.
 * Protéines et lipides restent fixes.
 * Les glucides peuvent augmenter OU diminuer par rapport à la base.
 */
export function computeAdjustedTargets(params: AdjustParams): AdjustedResult {
  const cfg = OBJECTIVE_CONFIGS[params.objective];
  const delta = params.isTrainingDay ? cfg.trainingDelta : cfg.restDelta;

  const adjustedTdee = params.bmr + params.activeKcalToday + params.estimatedRemainingKcal;
  const adjustedCalories = Math.round(adjustedTdee + delta);

  const calDiff = adjustedCalories - params.baseTargets.calories;
  const adjustedGlucides = Math.max(50, Math.round(params.baseTargets.glucides_g + calDiff / 4));

  return {
    calories: adjustedCalories,
    glucides_g: adjustedGlucides,
    adjustedTdee,
  };
}

