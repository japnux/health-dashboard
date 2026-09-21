// Zones de fréquence cardiaque en % de la FC max, partagées par les stats et
// la page de séance. Couleurs vives comme l'app de référence (bleu, vert,
// jaune, rouge, violet), toujours accompagnées du nom de la zone.

import { VIVID } from "@/lib/palette";

export const HR_ZONES = [
  { key: "z1", label: "Z1", name: "récupération", range: "50-60 %", color: VIVID.cyan },
  { key: "z2", label: "Z2", name: "endurance", range: "60-70 %", color: VIVID.green },
  { key: "z3", label: "Z3", name: "tempo", range: "70-80 %", color: VIVID.yellow },
  { key: "z4", label: "Z4", name: "seuil", range: "80-90 %", color: VIVID.red },
  { key: "z5", label: "Z5", name: "maximum", range: "90-100 %", color: VIVID.purple },
] as const;
