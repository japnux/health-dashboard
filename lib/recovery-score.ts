// Calcul du score de récupération /10.
// Pondération : 35% HRV, 25% FC repos, 30% sommeil, 10% fréq. respiratoire.
// Si un composant manque, son poids est redistribué proportionnellement.

export type RecoveryInput = {
  hrvMs?: number | null;
  hrv7dAvgMs?: number | null;
  restingHrBpm?: number | null;
  restingHr7dAvgBpm?: number | null;
  sleepTotalMin?: number | null;
  sleepRemPct?: number | null;
  sleepDeepPct?: number | null;
  respiratoryRate?: number | null;
  respiratoryRate7dAvg?: number | null;
};

export type RecoveryComponent = {
  score: number; // 1-10
  available: boolean;
};

export type RecoveryResult = {
  score: number | null; // 1-10, arrondi à 0.5 près
  basis: "full" | "partial" | "estimated"; // full = 4 composants OK, partial = 2-3, estimated = 1
  components: {
    hrv: RecoveryComponent;
    restingHr: RecoveryComponent;
    sleep: RecoveryComponent;
    respiratory: RecoveryComponent;
  };
};

// Interpolation linéaire entre deux paliers
function interpolate(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (value <= inMin) return outMin;
  if (value >= inMax) return outMax;
  const t = (value - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

function scoreHrv(hrvMs?: number | null, hrv7dAvgMs?: number | null): RecoveryComponent {
  if (hrvMs == null || hrv7dAvgMs == null || hrv7dAvgMs <= 0) {
    return { score: 0, available: false };
  }
  const ratio = hrvMs / hrv7dAvgMs; // 1.0 = égal à la moyenne 7j
  // Paliers : 0.80→1, 0.90→4, 1.00→7, 1.10→10
  let score: number;
  if (ratio >= 1.1) score = 10;
  else if (ratio >= 1.0) score = interpolate(ratio, 1.0, 1.1, 7, 10);
  else if (ratio >= 0.9) score = interpolate(ratio, 0.9, 1.0, 4, 7);
  else if (ratio >= 0.8) score = interpolate(ratio, 0.8, 0.9, 1, 4);
  else score = 1;
  return { score, available: true };
}

function scoreRestingHr(
  restingHrBpm?: number | null,
  restingHr7dAvgBpm?: number | null,
): RecoveryComponent {
  if (restingHrBpm == null || restingHr7dAvgBpm == null) {
    return { score: 0, available: false };
  }
  const delta = restingHrBpm - restingHr7dAvgBpm; // positif = mauvais
  // Paliers : -3 ou moins → 10, 0 → 7, +3 → 4, +7 ou plus → 1
  let score: number;
  if (delta <= -3) score = 10;
  else if (delta <= 0) score = interpolate(delta, -3, 0, 10, 7);
  else if (delta <= 3) score = interpolate(delta, 0, 3, 7, 4);
  else if (delta <= 7) score = interpolate(delta, 3, 7, 4, 1);
  else score = 1;
  return { score, available: true };
}

function scoreSleep(
  totalMin?: number | null,
  remPct?: number | null,
  deepPct?: number | null,
): RecoveryComponent {
  if (totalMin == null) {
    return { score: 0, available: false };
  }
  const totalH = totalMin / 60;
  // Paliers selon le brief système
  let score: number;
  if (totalH >= 7.5 && (remPct ?? 0) >= 20 && (deepPct ?? 0) >= 15) {
    score = 10;
  } else if (totalH >= 7 && (remPct ?? 0) >= 15 && (deepPct ?? 0) >= 10) {
    score = 7;
  } else if (totalH >= 6) {
    score = 4;
  } else {
    score = 1;
  }
  return { score, available: true };
}

// Fréq. respiratoire : plus basse pendant le sommeil = meilleure récupération.
// Fonctionne comme la FC repos : on compare au ratio vs moyenne 7j.
// Une respi basse = système parasympathique dominant = bonne récupération.
function scoreRespiratory(
  rate?: number | null,
  rate7dAvg?: number | null,
): RecoveryComponent {
  if (rate == null || rate7dAvg == null || rate7dAvg <= 0) {
    return { score: 0, available: false };
  }
  // delta positif = respi plus haute = moins bien récupéré
  const delta = rate - rate7dAvg;
  // Paliers similaires à FC repos : -1.5→10, 0→7, +1.5→4, +3→1
  let score: number;
  if (delta <= -1.5) score = 10;
  else if (delta <= 0) score = interpolate(delta, -1.5, 0, 10, 7);
  else if (delta <= 1.5) score = interpolate(delta, 0, 1.5, 7, 4);
  else if (delta <= 3) score = interpolate(delta, 1.5, 3, 4, 1);
  else score = 1;
  return { score, available: true };
}

export function computeRecoveryScore(input: RecoveryInput): RecoveryResult {
  const hrv = scoreHrv(input.hrvMs, input.hrv7dAvgMs);
  const restingHr = scoreRestingHr(input.restingHrBpm, input.restingHr7dAvgBpm);
  const sleep = scoreSleep(input.sleepTotalMin, input.sleepRemPct, input.sleepDeepPct);
  const respiratory = scoreRespiratory(input.respiratoryRate, input.respiratoryRate7dAvg);

  const all = [hrv, restingHr, sleep, respiratory];
  const availableCount = all.filter((c) => c.available).length;
  if (availableCount === 0) {
    return { score: null, basis: "estimated", components: { hrv, restingHr, sleep, respiratory } };
  }

  // Pondération : 35% HRV, 25% FC repos, 30% sommeil, 10% fréq. respiratoire
  // Si un composant manque, son poids est redistribué proportionnellement
  const weights = { hrv: 0.35, restingHr: 0.25, sleep: 0.30, respiratory: 0.10 };
  let totalWeight = 0;
  let weightedSum = 0;
  if (hrv.available) {
    weightedSum += hrv.score * weights.hrv;
    totalWeight += weights.hrv;
  }
  if (restingHr.available) {
    weightedSum += restingHr.score * weights.restingHr;
    totalWeight += weights.restingHr;
  }
  if (sleep.available) {
    weightedSum += sleep.score * weights.sleep;
    totalWeight += weights.sleep;
  }
  if (respiratory.available) {
    weightedSum += respiratory.score * weights.respiratory;
    totalWeight += weights.respiratory;
  }

  const rawScore = weightedSum / totalWeight;
  // Arrondi à 0.5 près
  const score = Math.round(rawScore * 2) / 2;

  let basis: RecoveryResult["basis"];
  if (availableCount >= 3) basis = "full";
  else if (availableCount === 2) basis = "partial";
  else basis = "estimated";

  return { score, basis, components: { hrv, restingHr, sleep, respiratory } };
}

// Helper d'affichage : couleur du badge selon score
export function recoveryColor(score: number | null): "green" | "yellow" | "red" | "gray" {
  if (score == null) return "gray";
  if (score >= 7) return "green";
  if (score >= 5) return "yellow";
  return "red";
}
