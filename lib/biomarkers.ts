// Registre des biomarqueurs pour le suivi biologie
// Source de vérité pour les catégories, unités et plages de référence optimales

export type BiomarkerCategory =
  | "foie"
  | "lipides"
  | "metabolique"
  | "hormones"
  | "vitamines"
  | "thyroide"
  | "inflammation"
  | "reins";

export type BiomarkerDef = {
  key: string;
  label: string;
  category: BiomarkerCategory;
  unit: string;
  refMin: number | null;
  refMax: number | null;
  /** true si une valeur basse est souhaitable (ex: LDL, glycémie) */
  lowerIsBetter?: boolean;
  desc?: string;
};

export type BiomarkerStatus = "optimal" | "borderline" | "out_of_range";

export const BIOMARKER_CATEGORIES: {
  key: BiomarkerCategory;
  label: string;
  icon: string;
}[] = [
  { key: "foie", label: "Foie", icon: "🫁" },
  { key: "lipides", label: "Lipides", icon: "🩸" },
  { key: "metabolique", label: "Métabolique", icon: "🔬" },
  { key: "hormones", label: "Hormones", icon: "⚗️" },
  { key: "vitamines", label: "Vitamines & Minéraux", icon: "💊" },
  { key: "thyroide", label: "Thyroïde", icon: "🦋" },
  { key: "inflammation", label: "Inflammation", icon: "🛡️" },
  { key: "reins", label: "Reins", icon: "💧" },
];

export const BIOMARKERS: BiomarkerDef[] = [
  // ─── Foie ──────────────────────────────────────────────
  { key: "alt", label: "ALT", category: "foie", unit: "U/L", refMin: null, refMax: 44, lowerIsBetter: true, desc: "Enzyme hépatique qui reflète l'intégrité des cellules du foie. Élevée en cas de souffrance hépatique." },
  { key: "ast", label: "AST", category: "foie", unit: "U/L", refMin: null, refMax: 40, lowerIsBetter: true, desc: "Enzyme présente dans le foie et les muscles. Son ratio avec l'ALT aide à différencier les causes d'atteinte hépatique." },
  { key: "alp", label: "ALP", category: "foie", unit: "U/L", refMin: 60, refMax: 90, desc: "Phosphatase alcaline, marqueur des voies biliaires et du métabolisme osseux." },
  { key: "ggt", label: "GGT", category: "foie", unit: "U/L", refMin: 10, refMax: 30, desc: "Marqueur sensible de la consommation d'alcool et du stress oxydatif hépatique." },
  { key: "ast_alt_ratio", label: "AST/ALT", category: "foie", unit: "calc", refMin: 0.8, refMax: 1.5, desc: "Ratio calculé qui aide à distinguer les atteintes hépatiques alcooliques des non-alcooliques." },
  { key: "fib4", label: "FIB-4", category: "foie", unit: "calc", refMin: 0.81, refMax: 0.9, desc: "Score de fibrose hépatique calculé à partir de l'âge, des plaquettes et des transaminases." },
  { key: "albumin", label: "Albumine", category: "foie", unit: "g/L", refMin: 35, refMax: 50, desc: "Protéine produite par le foie. Reflète la capacité de synthèse hépatique et l'état nutritionnel." },
  { key: "bilirubin", label: "Bilirubine conjuguée", category: "foie", unit: "mg/dL", refMin: null, refMax: 5, lowerIsBetter: true, desc: "Produit de dégradation de l'hémoglobine, métabolisé par le foie. Élevée en cas d'obstruction biliaire." },

  // ─── Lipides ───────────────────────────────────────────
  { key: "apob", label: "ApoB", category: "lipides", unit: "mg/dL", refMin: null, refMax: 60, lowerIsBetter: true, desc: "Protéine portée par les particules LDL athérogènes. Meilleur prédicteur du risque cardiovasculaire que le LDL-C." },
  { key: "hdl", label: "HDL-C", category: "lipides", unit: "mg/dL", refMin: 50, refMax: 80, desc: "\"Bon cholestérol\" — transporte le cholestérol des artères vers le foie pour élimination." },
  { key: "ldl", label: "LDL-C", category: "lipides", unit: "mg/dL", refMin: null, refMax: 100, lowerIsBetter: true, desc: "Cholestérol LDL, principal facteur de risque d'athérosclérose. Moins fiable que l'ApoB en cas de triglycérides élevés." },
  { key: "total_chol", label: "Cholestérol total", category: "lipides", unit: "mg/dL", refMin: null, refMax: 200, desc: "Somme de tous les cholestérols (HDL + LDL + VLDL). Peu informatif seul, à interpréter avec les sous-fractions." },
  { key: "triglycerides", label: "Triglycérides", category: "lipides", unit: "mg/dL", refMin: 50, refMax: 90, lowerIsBetter: true, desc: "Graisses circulantes liées à l'alimentation et à la résistance à l'insuline. Élevés par les glucides raffinés et l'alcool." },
  { key: "lpa", label: "Lp(a)", category: "lipides", unit: "nmol/L", refMin: null, refMax: 75, lowerIsBetter: true, desc: "Lipoprotéine génétiquement déterminée, facteur de risque cardiovasculaire indépendant et non modifiable par le mode de vie." },
  { key: "non_hdl", label: "Non-HDL-C", category: "lipides", unit: "mg/dL", refMin: null, refMax: 100, lowerIsBetter: true, desc: "Cholestérol total moins HDL. Capture toutes les particules athérogènes, incluant VLDL et remnants." },

  // ─── Métabolique ───────────────────────────────────────
  { key: "fasting_glucose", label: "Glycémie à jeun", category: "metabolique", unit: "g/L", refMin: 0.75, refMax: 0.86, lowerIsBetter: true, desc: "Taux de sucre sanguin à jeun. Un des premiers marqueurs de résistance à l'insuline et de prédiabète." },
  { key: "hba1c", label: "HbA1c", category: "metabolique", unit: "%", refMin: 4, refMax: 5, lowerIsBetter: true, desc: "Moyenne de la glycémie sur 2-3 mois. Marqueur clé du contrôle glycémique et du risque de diabète." },
  { key: "homa_ir", label: "HOMA-IR", category: "metabolique", unit: "calc", refMin: null, refMax: 1.5, lowerIsBetter: true, desc: "Indice de résistance à l'insuline calculé à partir de la glycémie et de l'insuline à jeun." },
  { key: "insulin", label: "Insuline", category: "metabolique", unit: "µIU/mL", refMin: 2.6, refMax: 24.9, desc: "Hormone pancréatique qui régule la glycémie. Élevée des années avant que la glycémie ne monte." },
  { key: "uric_acid", label: "Acide urique", category: "metabolique", unit: "mg/L", refMin: 30, refMax: 55, lowerIsBetter: true, desc: "Produit du métabolisme des purines. Élevé par le fructose, l'alcool et les protéines animales. Lié à la goutte et au risque cardiovasculaire." },
  { key: "urea", label: "Urée", category: "metabolique", unit: "g/L", refMin: 0.07, refMax: 0.1, desc: "Déchet du métabolisme des protéines, éliminé par les reins. Reflète l'apport protéique et la fonction rénale." },

  // ─── Hormones ──────────────────────────────────────────
  { key: "free_testo", label: "Testostérone libre", category: "hormones", unit: "nmol/L", refMin: 0.25, refMax: 0.5, desc: "Fraction active de la testostérone, non liée aux protéines. Directement utilisable par les tissus." },
  { key: "bioav_testo", label: "Testo biodisponible", category: "hormones", unit: "ng/dL", refMin: 100, refMax: 370, desc: "Testostérone libre + liée à l'albumine. Meilleur reflet de la testostérone réellement disponible pour les tissus." },
  { key: "total_testo", label: "Testostérone totale", category: "hormones", unit: "ng/mL", refMin: 3, refMax: 10, desc: "Somme de toutes les formes de testostérone. Essentielle pour la masse musculaire, l'énergie et la libido." },
  { key: "dhea", label: "DHEA", category: "hormones", unit: "ng/mL", refMin: 7, refMax: 11, desc: "Hormone surrénalienne précurseur de la testostérone et des estrogènes. Décline avec l'âge, marqueur de vitalité." },
  { key: "shbg", label: "SHBG", category: "hormones", unit: "nmol/L", refMin: 18, refMax: 54, desc: "Protéine de transport qui lie la testostérone et l'estradiol. Trop élevée = moins de testostérone libre disponible." },
  { key: "progesterone", label: "Progestérone", category: "hormones", unit: "nmol/L", refMin: 0.32, refMax: 0.64, desc: "Hormone stéroïdienne aux effets calmants et neuroprotecteurs. Chez l'homme, produite par les surrénales." },

  // ─── Vitamines & Minéraux ──────────────────────────────
  { key: "vitd", label: "Vitamine D", category: "vitamines", unit: "ng/mL", refMin: 50, refMax: 80, desc: "Hormone stéroïde essentielle pour l'immunité, les os et la force musculaire. Déficiente chez la majorité de la population." },
  { key: "b12", label: "Vitamine B12", category: "vitamines", unit: "pg/mL", refMin: 500, refMax: 1100, desc: "Vitamine essentielle au système nerveux et à la formation des globules rouges. Carence fréquente et insidieuse." },
  { key: "b9", label: "Vitamine B9", category: "vitamines", unit: "ng/mL", refMin: 8, refMax: 17, desc: "Folate, essentiel à la synthèse de l'ADN et au métabolisme de l'homocystéine. Travaille en synergie avec la B12." },
  { key: "ferritin", label: "Ferritine", category: "vitamines", unit: "µg/L", refMin: 60, refMax: 120, desc: "Réserves en fer de l'organisme. Basse = fatigue, chute de cheveux, faiblesse. Trop haute = inflammation ou surcharge en fer." },
  { key: "iron", label: "Fer", category: "vitamines", unit: "µg/dL", refMin: 65, refMax: 175, desc: "Fer sérique circulant, nécessaire au transport de l'oxygène. Variable dans la journée, à interpréter avec la ferritine." },
  { key: "calcium", label: "Calcium", category: "vitamines", unit: "mg/L", refMin: 85, refMax: 105, desc: "Minéral clé pour les os, la contraction musculaire et la signalisation nerveuse. Régulé par la vitamine D et la PTH." },
  { key: "magnesium", label: "Magnésium", category: "vitamines", unit: "mg/L", refMin: 18, refMax: 24, desc: "Cofacteur de plus de 300 réactions enzymatiques. Essentiel pour le sommeil, la récupération et la gestion du stress." },

  // ─── Thyroïde ──────────────────────────────────────────
  { key: "tsh", label: "TSH", category: "thyroide", unit: "mIU/L", refMin: 0.5, refMax: 3, desc: "Hormone hypophysaire qui stimule la thyroïde. Marqueur principal du fonctionnement thyroïdien." },
  { key: "free_t3", label: "Free T3", category: "thyroide", unit: "pg/mL", refMin: 3.2, refMax: 4.4, desc: "Forme active de l'hormone thyroïdienne. Régule le métabolisme, l'énergie et la thermogenèse." },
  { key: "free_t4", label: "Free T4", category: "thyroide", unit: "ng/dL", refMin: 0.8, refMax: 1.5, desc: "Forme de réserve de l'hormone thyroïdienne, convertie en T3 active dans les tissus." },

  // ─── Inflammation & Immunité ───────────────────────────
  { key: "hscrp", label: "hsCRP", category: "inflammation", unit: "mg/L", refMin: null, refMax: 1.0, lowerIsBetter: true, desc: "Protéine C-réactive ultra-sensible. Marqueur d'inflammation systémique de bas grade et de risque cardiovasculaire." },
  { key: "homocysteine", label: "Homocystéine", category: "inflammation", unit: "µmol/L", refMin: 5, refMax: 10, lowerIsBetter: true, desc: "Acide aminé toxique pour les vaisseaux quand élevé. Réduit par les vitamines B9, B12 et B6." },
  { key: "wbc", label: "Leucocytes", category: "inflammation", unit: "giga/L", refMin: 3, refMax: 10, desc: "Globules blancs, cellules du système immunitaire. Élevés en cas d'infection ou d'inflammation chronique." },
  { key: "psa", label: "PSA", category: "inflammation", unit: "ng/mL", refMin: null, refMax: 1.5, lowerIsBetter: true, desc: "Antigène prostatique spécifique. Marqueur de suivi de la prostate, peut être élevé par l'inflammation ou l'exercice intense." },

  // ─── Reins ─────────────────────────────────────────────
  { key: "creatinine", label: "Créatinine", category: "reins", unit: "mg/dL", refMin: 0.55, refMax: 1.05, desc: "Déchet musculaire filtré par les reins. Reflète la masse musculaire et la fonction rénale." },
  { key: "egfr", label: "DFG estimé", category: "reins", unit: "mL/min", refMin: 90, refMax: 120, desc: "Débit de filtration glomérulaire, mesure la capacité des reins à filtrer le sang. Indicateur clé de la santé rénale." },
];

// ─── Index et helpers ────────────────────────────────────────────────

export const BIOMARKERS_BY_KEY = new Map(BIOMARKERS.map((b) => [b.key, b]));

/** Évalue le statut d'un biomarqueur par rapport à sa plage de référence optimale.
 *  Tolérance relative au boundary (50%) : simule la zone "normal labo" de Lucis. */
export function getBiomarkerStatus(
  value: number,
  refMin: number | null,
  refMax: number | null,
): BiomarkerStatus {
  if (refMin == null && refMax == null) return "optimal";

  // Dans la plage optimale
  if ((refMax == null || value <= refMax) && (refMin == null || value >= refMin)) {
    return "optimal";
  }

  // Au-dessus du max : % d'écart par rapport au max
  if (refMax != null && value > refMax) {
    const pctOver = refMax > 0 ? (value - refMax) / refMax : 1;
    return pctOver <= 0.5 ? "borderline" : "out_of_range";
  }

  // En-dessous du min : % d'écart par rapport au min
  if (refMin != null && value < refMin) {
    const pctUnder = refMin > 0 ? (refMin - value) / refMin : 1;
    return pctUnder <= 0.5 ? "borderline" : "out_of_range";
  }

  return "optimal";
}

/** Marqueurs clés à afficher sur le dashboard (sous-ensemble curé) */
export const DASHBOARD_KEY_MARKERS = [
  "vitd",
  "b12",
  "ferritin",
  "apob",
  "hba1c",
  "hscrp",
  "free_testo",
  "homocysteine",
] as const;
