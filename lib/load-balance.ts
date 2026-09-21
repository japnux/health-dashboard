// Équilibre de charge (ratio de charge aiguë / chronique).
//
// Calcul : moyennes mobiles exponentielles (EWMA) de la charge cardio
// quotidienne, sur 7 jours (charge aiguë) et 42 jours (charge chronique),
// journée en cours comprise. λ = 2 / (N + 1), d'après Williams et al. (2017),
// qui montrent que l'EWMA détecte mieux les hausses brutales qu'une moyenne
// glissante simple. C'est aussi la formule des apps de suivi (même valeurs
// à ±0,05 sur l'historique de l'utilisateur).
//
// Zones d'après Gabbett (2016). Source unique pour l'accueil, la page de
// détail, les stats et le calcul : mêmes seuils, couleurs, libellés et
// conseils. La couleur n'est jamais seule : chaque zone a son libellé.

export type BalanceLevel = "low" | "balanced" | "rising" | "spike";

export const BALANCE_ZONES: {
  level: BalanceLevel;
  from: number;
  to: number;
  color: string;
  label: string; // court, pour les graphiques
  long: string; // statut, pour la tuile et la page de détail
  advice: string; // quoi en faire
}[] = [
  {
    level: "low",
    from: 0,
    to: 0.8,
    color: "#94a3b8",
    label: "sous-charge",
    long: "sous ta charge habituelle",
    advice:
      "Tu en fais moins que d'habitude. Parfait pour récupérer, mais si ça dure plusieurs semaines, ta forme de fond va baisser.",
  },
  {
    level: "balanced",
    from: 0.8,
    to: 1.3,
    color: "#15be53",
    label: "optimal",
    long: "zone optimale",
    advice:
      "Ta charge suit le rythme auquel ton corps est habitué. C'est la zone où l'on progresse avec le moins de risque.",
  },
  {
    level: "rising",
    from: 1.3,
    to: 1.5,
    color: "#f97316",
    label: "risque modéré",
    long: "risque modéré de blessure",
    advice:
      "Hausse rapide par rapport à ton habitude. Utile ponctuellement pour progresser, mais évite d'enchaîner plusieurs jours comme ça.",
  },
  {
    level: "spike",
    from: 1.5,
    to: Infinity,
    color: "#ea2261",
    label: "risque élevé",
    long: "risque élevé de blessure",
    advice:
      "Charge bien au-dessus de ce à quoi ton corps est habitué : le risque de blessure augmente nettement. Prévois une journée légère ou de récupération.",
  },
];

export function balanceZone(ratio: number) {
  return BALANCE_ZONES.find((z) => ratio < z.to) ?? BALANCE_ZONES[BALANCE_ZONES.length - 1];
}

export const ACUTE_DAYS = 7;
export const CHRONIC_DAYS = 42;
// Historique minimal avant d'afficher un ratio : la moyenne 42 j doit
// s'être stabilisée
const MIN_HISTORY_DAYS = 28;

export type LoadPoint = {
  date: string;
  load: number; // charge du jour (0 si jour sans mesure)
  measured: boolean; // false : aucune charge enregistrée ce jour-là
  acute: number; // EWMA 7 j
  chronic: number; // EWMA 42 j
  ratio: number | null; // null tant que l'historique est trop court
};

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Série jour par jour, du premier jour mesuré jusqu'à `until` inclus.
// Un jour sans mesure compte 0 (montre non portée = pas de charge connue).
export function loadBalanceSeries(
  rows: { date: string; cardio_load: number | null }[],
  until: string,
): LoadPoint[] {
  const byDate = new Map<string, number>();
  for (const r of rows) if (r.cardio_load != null) byDate.set(r.date, Number(r.cardio_load));
  const dates = [...byDate.keys()].sort();
  if (dates.length === 0) return [];

  const la = 2 / (ACUTE_DAYS + 1);
  const lc = 2 / (CHRONIC_DAYS + 1);
  const out: LoadPoint[] = [];
  let acute = 0;
  let chronic = 0;
  let i = 0;
  for (let d = dates[0]; d <= until; d = addDays(d, 1), i++) {
    const measured = byDate.has(d);
    const load = byDate.get(d) ?? 0;
    acute = i === 0 ? load : la * load + (1 - la) * acute;
    chronic = i === 0 ? load : lc * load + (1 - lc) * chronic;
    out.push({
      date: d,
      load: Math.round(load),
      measured,
      acute: Math.round(acute * 10) / 10,
      chronic: Math.round(chronic * 10) / 10,
      ratio: i + 1 >= MIN_HISTORY_DAYS && chronic > 0 ? Math.round((acute / chronic) * 100) / 100 : null,
    });
  }
  return out;
}
