// Helpers de date — par défaut en Europe/Paris (Geoffrey est mobile mais
// majoritairement en EU). À paramétrer si besoin via une variable d'env.

const DEFAULT_TZ = process.env.DASHBOARD_TZ ?? "Europe/Paris";

// Retourne la date du jour au format YYYY-MM-DD dans la timezone donnée.
export function todayIso(tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

// Retourne la date à J-N au format YYYY-MM-DD.
export function isoDaysAgo(n: number, tz: string = DEFAULT_TZ): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
}

// Format français long pour affichage : "lundi 4 mai 2026"
export function formatFrLong(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`); // midi UTC pour éviter les bascules de jour
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

// Soustrait N jours à une date ISO arbitraire. Retourne YYYY-MM-DD.
export function isoDateMinusDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Différence en jours entre deux dates ISO (a - b).
export function diffDaysIso(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((da - db) / (1000 * 60 * 60 * 24));
}
