// Utilitaires de transformation des données pour les charts Recharts.

import { isoDateMinusDays } from "@/lib/dates";

// Comble les jours manquants dans un tableau de données triées par date.
// Chaque jour absent reçoit des valeurs null pour tous les champs numériques.
export function fillMissingDays<T extends { date: string }>(
  data: T[],
  startDate: string,
  endDate: string,
): (T & { date: string })[] {
  const map = new Map(data.map((d) => [d.date, d]));
  const result: (T & { date: string })[] = [];

  let current = startDate;
  while (current <= endDate) {
    const existing = map.get(current);
    if (existing) {
      result.push(existing);
    } else {
      // Crée une entrée vide avec tous les champs à null sauf date
      const empty = { date: current } as T & { date: string };
      result.push(empty);
    }
    current = nextDay(current);
  }

  return result;
}

// Calcule une moyenne glissante sur une fenêtre donnée.
export function computeMovingAverage(
  data: { date: string; value: number | null }[],
  windowSize: number,
): { date: string; value: number | null; avg: number | null }[] {
  return data.map((point, i) => {
    const windowStart = Math.max(0, i - windowSize + 1);
    const windowSlice = data.slice(windowStart, i + 1);
    const validValues = windowSlice
      .map((p) => p.value)
      .filter((v): v is number => v != null);

    return {
      ...point,
      avg:
        validValues.length > 0
          ? Math.round(
              (validValues.reduce((a, b) => a + b, 0) / validValues.length) *
                10,
            ) / 10
          : null,
    };
  });
}

// Formate une date ISO en label court (ex: "4 mai", "15 jan")
export function shortDateLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
  }).format(d);
}

// Jour suivant en ISO.
function nextDay(iso: string): string {
  return isoDateMinusDays(iso, -1);
}
