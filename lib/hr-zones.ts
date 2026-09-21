// Zones de fréquence cardiaque en % de la FC max, partagées par les stats et
// la page de séance. Rampe ordinale bleue validée (un seul ton, clair →
// foncé, le plus clair reste lisible sur fond clair).

export const HR_ZONES = [
  { key: "z1", label: "Z1", name: "récupération", range: "50-60 %", color: "#86b6ef" },
  { key: "z2", label: "Z2", name: "endurance", range: "60-70 %", color: "#5598e7" },
  { key: "z3", label: "Z3", name: "tempo", range: "70-80 %", color: "#2a78d6" },
  { key: "z4", label: "Z4", name: "seuil", range: "80-90 %", color: "#1c5cab" },
  { key: "z5", label: "Z5", name: "maximum", range: "90-100 %", color: "#0d366b" },
] as const;
