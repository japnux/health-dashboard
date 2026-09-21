// Zones de l'équilibre de charge (ratio charge 7 j / 28 j), d'après Gabbett
// (2016). Source unique pour l'accueil, les stats et le calcul : mêmes
// seuils, mêmes couleurs d'état, mêmes libellés. La couleur n'est jamais
// seule : chaque zone a son libellé.

export type BalanceLevel = "low" | "balanced" | "rising" | "spike";

export const BALANCE_ZONES: {
  level: BalanceLevel;
  from: number;
  to: number;
  color: string;
  label: string; // court, pour les graphiques
  long: string; // phrase, pour l'accueil
}[] = [
  { level: "low", from: 0, to: 0.8, color: "#94a3b8", label: "sous-charge", long: "sous ta charge habituelle" },
  { level: "balanced", from: 0.8, to: 1.3, color: "#15be53", label: "équilibré", long: "progression équilibrée" },
  { level: "rising", from: 1.3, to: 1.5, color: "#f97316", label: "en hausse", long: "hausse rapide, à surveiller" },
  { level: "spike", from: 1.5, to: Infinity, color: "#ea2261", label: "pic", long: "pic de charge, risque de blessure accru" },
];

export function balanceZone(ratio: number) {
  return BALANCE_ZONES.find((z) => ratio < z.to) ?? BALANCE_ZONES[BALANCE_ZONES.length - 1];
}
