/**
 * Analyse l'impact des entrées journal sur le recovery score du lendemain.
 * Compare les jours avec un facteur donné vs sans → delta recovery.
 */

type JournalRow = {
  date: string;
  mood: number | null;
  energy: number | null;
  stress: number | null;
};

type MetricsRow = {
  date: string;
  recovery_score: number | null;
};

export type ImpactFactor = {
  label: string;
  emoji: string;
  impact: number; // delta recovery moyen (positif = bon)
  sampleSize: number;
  direction: "positive" | "negative" | "neutral";
};

/**
 * Calcule l'impact de chaque facteur journal sur le recovery du lendemain.
 * Nécessite au moins 5 jours de données croisées pour être pertinent.
 */
export function computeJournalImpact(
  journal: JournalRow[],
  metrics: MetricsRow[],
): ImpactFactor[] {
  // Indexer recovery par date
  const recoveryByDate = new Map<string, number>();
  for (const m of metrics) {
    if (m.recovery_score != null) {
      recoveryByDate.set(m.date, m.recovery_score);
    }
  }

  // Pour chaque entrée journal, associer le recovery du lendemain
  type DayData = JournalRow & { nextDayRecovery: number };
  const paired: DayData[] = [];

  for (const j of journal) {
    const nextDay = addDay(j.date);
    const recovery = recoveryByDate.get(nextDay);
    if (recovery != null) {
      paired.push({ ...j, nextDayRecovery: recovery });
    }
  }

  if (paired.length < 5) return [];

  const avgRecovery = paired.reduce((s, d) => s + d.nextDayRecovery, 0) / paired.length;

  const factors: ImpactFactor[] = [];

  // Mood élevé (4-5) vs bas (1-2)
  const moodHigh = paired.filter((d) => d.mood != null && d.mood >= 4);
  const moodLow = paired.filter((d) => d.mood != null && d.mood <= 2);
  if (moodHigh.length >= 3 && moodLow.length >= 2) {
    const avgHigh = avg(moodHigh.map((d) => d.nextDayRecovery));
    const avgLow = avg(moodLow.map((d) => d.nextDayRecovery));
    const delta = avgHigh - avgLow;
    factors.push({
      label: "Bonne humeur",
      emoji: "😄",
      impact: round1(delta),
      sampleSize: moodHigh.length + moodLow.length,
      direction: delta > 0.3 ? "positive" : delta < -0.3 ? "negative" : "neutral",
    });
  }

  // Énergie élevée (4-5) vs basse (1-2)
  const energyHigh = paired.filter((d) => d.energy != null && d.energy >= 4);
  const energyLow = paired.filter((d) => d.energy != null && d.energy <= 2);
  if (energyHigh.length >= 3 && energyLow.length >= 2) {
    const avgHigh = avg(energyHigh.map((d) => d.nextDayRecovery));
    const avgLow = avg(energyLow.map((d) => d.nextDayRecovery));
    const delta = avgHigh - avgLow;
    factors.push({
      label: "Énergie élevée",
      emoji: "🔥",
      impact: round1(delta),
      sampleSize: energyHigh.length + energyLow.length,
      direction: delta > 0.3 ? "positive" : delta < -0.3 ? "negative" : "neutral",
    });
  }

  // Stress élevé (4-5) vs bas (1-2) — ici impact négatif attendu
  const stressHigh = paired.filter((d) => d.stress != null && d.stress >= 4);
  const stressLow = paired.filter((d) => d.stress != null && d.stress <= 2);
  if (stressHigh.length >= 3 && stressLow.length >= 2) {
    const avgHigh = avg(stressHigh.map((d) => d.nextDayRecovery));
    const avgLow = avg(stressLow.map((d) => d.nextDayRecovery));
    // Inverser : impact du stress élevé vs référence basse
    const delta = avgHigh - avgLow;
    factors.push({
      label: "Stress élevé",
      emoji: "😰",
      impact: round1(delta),
      sampleSize: stressHigh.length + stressLow.length,
      direction: delta > 0.3 ? "positive" : delta < -0.3 ? "negative" : "neutral",
    });
  }

  // Trier par impact absolu décroissant
  factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  return factors;
}

function addDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function avg(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
