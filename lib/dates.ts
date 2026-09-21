// Helpers de date — par défaut en Europe/Paris (Geoffrey est mobile mais
// majoritairement en EU). À paramétrer si besoin via une variable d'env.

const DEFAULT_TZ = process.env.DASHBOARD_TZ ?? "Europe/Paris";

// Retourne la date du jour au format YYYY-MM-DD dans la timezone donnée.
export function todayIso(tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

// Retourne la date à J-N au format YYYY-MM-DD.
// Calcul en jours calendaires à partir de la date locale du jour : retirer
// N × 24 h donnait J-2 au lieu de J-1 juste après un changement d'heure.
export function isoDaysAgo(n: number, tz: string = DEFAULT_TZ): string {
  return isoDateMinusDays(todayIso(tz), n);
}

// Date calendaire (YYYY-MM-DD) d'un instant, dans la timezone donnée.
// À utiliser pour rattacher une séance (started_at en UTC) à son jour :
// un surf à 00h30 heure de Paris est le 21, pas le 20 comme en UTC.
export function dateInTz(instant: string | Date, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(instant));
}

// Décalage de la timezone par rapport à UTC à un instant donné, en ms.
function tzOffsetMs(date: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

// Minuit local d'une date YYYY-MM-DD, en ISO UTC. Sert de borne pour les
// requêtes sur started_at (timestamptz) : "2026-09-21" → "2026-09-20T22:00:00.000Z".
export function localMidnightUtcIso(isoDate: string, tz: string = DEFAULT_TZ): string {
  const guess = new Date(`${isoDate}T00:00:00Z`);
  return new Date(guess.getTime() - tzOffsetMs(guess, tz)).toISOString();
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
