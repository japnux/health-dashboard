// Tendance de composition corporelle par régression linéaire simple.
// Lisse le bruit point-à-point pour donner un signal de direction stable.

export type BodyMeasurement = {
  measured_at: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
};

export type BodyTrend = {
  slopePerWeek: number; // unité/sem (kg pour poids/lean, points de % pour fat)
  samples: number; // nombre de mesures utilisées dans la fenêtre
  r2: number; // qualité d'ajustement [0..1]
  windowDays: number; // taille de fenêtre demandée
  direction: "down" | "up" | "flat"; // direction qualifiée (au-dessus du seuil de bruit)
};

type Point = { dayIndex: number; value: number };

// Régression linéaire y = a·x + b par moindres carrés.
// Renvoie aussi R² (1 - SSres/SStot).
function linearRegression(
  points: Point[],
): { slope: number; intercept: number; r2: number } | null {
  if (points.length < 2) return null;
  const n = points.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;
  for (const p of points) {
    sumX += p.dayIndex;
    sumY += p.value;
    sumXY += p.dayIndex * p.value;
    sumX2 += p.dayIndex * p.dayIndex;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of points) {
    ssTot += (p.value - meanY) ** 2;
    ssRes += (p.value - (slope * p.dayIndex + intercept)) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, intercept, r2 };
}

// Seuils de bruit en valeur absolue par semaine, sous lesquels on considère "flat".
const FLAT_THRESHOLDS = {
  weight_kg: 0.05,
  body_fat_pct: 0.05,
  lean_mass_kg: 0.05,
};

export function computeTrend(
  bodies: BodyMeasurement[] | null | undefined,
  metric: "weight_kg" | "body_fat_pct" | "lean_mass_kg",
  windowDays = 60,
): BodyTrend | null {
  if (!bodies || bodies.length < 2) return null;
  const todayMs = Date.now();
  const cutoffMs = todayMs - windowDays * 86_400_000;
  const points: Point[] = [];
  for (const b of bodies) {
    const v = b[metric];
    if (v == null) continue;
    const t = new Date(b.measured_at).getTime();
    if (Number.isNaN(t) || t < cutoffMs) continue;
    points.push({
      // index en jours depuis le début de fenêtre (échelle compatible avec slopePerWeek = slope * 7)
      dayIndex: (t - cutoffMs) / 86_400_000,
      value: v,
    });
  }
  if (points.length < 3) return null; // tendance peu fiable sous 3 points
  const reg = linearRegression(points);
  if (!reg) return null;
  const slopePerWeek = reg.slope * 7;
  const threshold = FLAT_THRESHOLDS[metric];
  const direction: BodyTrend["direction"] =
    Math.abs(slopePerWeek) < threshold ? "flat" : slopePerWeek > 0 ? "up" : "down";
  return {
    slopePerWeek,
    samples: points.length,
    r2: reg.r2,
    windowDays,
    direction,
  };
}
