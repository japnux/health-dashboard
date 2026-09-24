// Style commun des infobulles de graphiques : fond sombre, texte clair.
// itemStyle est indispensable : sans lui, Recharts écrit la valeur dans la
// couleur de la série (ou en noir), illisible sur le fond sombre.
export const TOOLTIP_PROPS = {
  contentStyle: { backgroundColor: "#27272a", border: "none", borderRadius: 8, color: "#fff", fontSize: 12 },
  itemStyle: { color: "#fff", padding: 0 },
  labelStyle: { color: "rgba(255, 255, 255, 0.65)", marginBottom: 2 },
} as const;
