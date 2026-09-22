// Palette vive des zones et statuts (inspirée des couleurs système d'Apple,
// comme l'app de référence). Chaque couleur s'accompagne toujours d'un
// libellé : l'état n'est jamais porté par la couleur seule.

export const VIVID = {
  red: "#ff3b30",
  orange: "#ff9500",
  yellow: "#ffcc00",
  lime: "#a4de02",
  green: "#34c759",
  cyan: "#32ade6",
  blue: "#007aff",
  indigo: "#5856d6",
  purple: "#af52de",
  gray: "#8e8e93",
} as const;

// Versions foncées pour du TEXTE coloré sur fond clair (contraste ≥ 4,5:1).
// Les couleurs VIVID restent réservées aux pastilles, barres et fonds.
export const TEXT = {
  green: "#1f7a3a",
  red: "#c0271e",
  orange: "#a15c00",
  yellow: "#8a6d00",
  blue: "#0058b8",
  purple: "#7a2fa3",
} as const;

// Teinte de fond d'une couleur hex (#rrggbb) : alpha en hex ajouté
export function tint(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

// Dégradé de fond d'une carte teintée par son statut
export function tintedBackground(hex: string, strength = 1): string {
  return `linear-gradient(160deg, ${tint(hex, 0.26 * strength)} 0%, ${tint(hex, 0.1 * strength)} 55%, ${tint(hex, 0.04 * strength)} 100%)`;
}

// Couleur d'accent par sport (type normalisé, voir lib/workout-types)
const SPORT_COLOR: Record<string, string> = {
  surf: VIVID.cyan,
  natation: VIVID.blue,
  musculation: VIVID.purple,
  course: VIVID.orange,
  vélo: VIVID.yellow,
  marche: VIVID.green,
  rando: VIVID.green,
  yoga: VIVID.lime,
  sauna: VIVID.red,
  tennis: VIVID.lime,
  skate: VIVID.indigo,
};

export function sportColor(normalizedType: string): string {
  return SPORT_COLOR[normalizedType] ?? VIVID.indigo;
}
