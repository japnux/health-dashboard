// Mesures corporelles de la nuit : définitions partagées par les tuiles de
// l'accueil et les pages /mesure/[key].
//
// Plage normale = ta moyenne ± 1 écart-type sur les 60 jours précédents
// (environ 2 nuits sur 3 y tombent). Elle est personnelle : une valeur hors
// plage n'est pas anormale médicalement, elle est inhabituelle pour toi.

// SpO₂ : seuils uniques pour l'accueil, les mesures et les IA.
// Dès 95 % : normal, même hors plage perso. Sous 93 % : alerte.
export const SPO2_NORMAL_FROM = 95;
export const SPO2_ALERT = 93;

export type BodyMetricKey = "sleeping_hr" | "hrv" | "wrist_temp" | "respiration" | "spo2";

export type BodyMetricDef = {
  key: BodyMetricKey;
  column: "sleeping_hr_bpm" | "hrv_ms" | "wrist_temp_c" | "respiratory_rate" | "spo2_pct";
  label: string;
  short: string; // libellé court pour les tuiles
  unit: string;
  decimals: number;
  better: "low" | "high" | "range"; // sens favorable
  minHistory: number; // nuits de référence avant d'afficher une plage
  // Seuil médical au-delà duquel la valeur n'est jamais signalée, même hors
  // de la plage personnelle (SpO₂ : la plage est si étroite que 97 % en
  // sortirait, alors que c'est normal)
  normalFrom?: number;
  about: string;
};

export const BODY_METRICS: BodyMetricDef[] = [
  {
    key: "sleeping_hr",
    column: "sleeping_hr_bpm",
    label: "FC de sommeil",
    short: "FC",
    unit: "bpm",
    decimals: 0,
    better: "low",
    minHistory: 14,
    about:
      "Ta fréquence cardiaque la plus basse pendant le sommeil (moyenne horaire). Elle monte avec la fatigue, le stress, l'alcool ou un début de maladie. C'est elle qui entre dans ton score de récupération.",
  },
  {
    key: "hrv",
    column: "hrv_ms",
    label: "Variabilité cardiaque (HRV)",
    short: "HRV",
    unit: "ms",
    decimals: 0,
    better: "high",
    minHistory: 14,
    about:
      "Médiane des mesures de HRV prises pendant ton sommeil. Plus elle est haute par rapport à ton habitude, mieux ton système nerveux a récupéré. Elle varie beaucoup d'une personne à l'autre : seule ta tendance compte.",
  },
  {
    key: "wrist_temp",
    column: "wrist_temp_c",
    label: "Température du poignet",
    short: "Temp.",
    unit: "°C",
    decimals: 1,
    better: "range",
    minHistory: 5,
    about:
      "Température de la peau au poignet pendant la nuit. La valeur absolue compte peu ; un écart net au-dessus de ta plage peut signaler une fièvre, une infection ou une forte fatigue.",
  },
  {
    key: "respiration",
    column: "respiratory_rate",
    label: "Fréquence respiratoire",
    short: "Resp.",
    unit: "/min",
    decimals: 1,
    better: "low",
    minHistory: 14,
    about:
      "Nombre de respirations par minute pendant le sommeil. Très stable d'une nuit à l'autre : une hausse d'une respiration par minute ou plus mérite attention (effort récent, maladie, altitude).",
  },
  {
    key: "spo2",
    column: "spo2_pct",
    label: "Oxygène sanguin (SpO₂)",
    short: "SpO₂",
    unit: "%",
    decimals: 0,
    better: "high",
    minHistory: 14,
    normalFrom: SPO2_NORMAL_FROM,
    about:
      "Saturation du sang en oxygène pendant la nuit. Normalement entre 95 et 100 %. Une valeur basse répétée peut venir de troubles respiratoires du sommeil ou de l'altitude.",
  },
];

export const BODY_METRICS_BY_KEY = new Map(BODY_METRICS.map((m) => [m.key, m]));

export type MetricRange = { low: number; high: number; mean: number; nights: number };

// Plage normale personnelle : moyenne ± 1 écart-type des valeurs passées
export function metricRange(values: (number | null)[], minHistory: number): MetricRange | null {
  const v = values.filter((x): x is number => x != null);
  if (v.length < minHistory) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  return { low: mean - sd, high: mean + sd, mean, nights: v.length };
}

export type MetricStatus = "in" | "above" | "below";

export function metricStatus(
  value: number,
  range: MetricRange | null,
  normalFrom?: number,
): MetricStatus | null {
  if (!range) return null;
  if (normalFrom != null && value >= normalFrom && value < range.low) return "in";
  if (value > range.high) return "above";
  if (value < range.low) return "below";
  return "in";
}

// Un écart est-il favorable ? (ex. HRV au-dessus de la plage = bon signe)
export function isFavorable(def: BodyMetricDef, status: MetricStatus | null): boolean | null {
  if (status == null || status === "in") return null;
  if (def.better === "range") return false;
  return (def.better === "high") === (status === "above");
}

export function formatMetric(def: BodyMetricDef, v: number): string {
  return v.toFixed(def.decimals).replace(".", ",");
}
