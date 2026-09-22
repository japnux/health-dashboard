// Utilitaires de formatage pour les graphiques.

// Formate une date ISO en label court (ex: "4 mai", "15 janv.")
export function shortDateLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}
