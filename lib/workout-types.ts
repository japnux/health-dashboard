/**
 * Mapping des noms Apple Health (EN/FR) → noms planned activities (FR minuscules).
 * Utilisé pour croiser workouts réalisés et activités prévues.
 */
export const WORKOUT_TYPE_MAP: Record<string, string> = {
  // Surf
  surfingsports: "surf",
  "sports de surf": "surf",
  watersports: "surf",
  surfing: "surf",
  surf: "surf",
  // Musculation
  functionalstrengthtraining: "musculation",
  "functional strength training": "musculation",
  "entraînement de force fonctionnelle": "musculation",
  "strength training": "musculation",
  "traditional strength training": "musculation",
  crosstraining: "musculation",
  musculation: "musculation",
  // Yoga
  yoga: "yoga",
  flexibility: "yoga",
  pilates: "pilates",
  // Natation
  swimming: "natation",
  "pool swim": "natation",
  "open water swim": "natation",
  "piscine nager": "natation",
  natation: "natation",
  // Course / marche
  running: "course",
  "outdoor run": "course",
  "indoor run": "course",
  "extérieur course": "course",
  "intérieur course": "course",
  course: "course",
  walking: "marche",
  hiking: "rando",
  // Vélo
  cycling: "vélo",
  // Snowboard
  snowboarding: "snowboard",
  snowboard: "snowboard",
  // Skate / patinage
  skatingsports: "skate",
  "sports de patinage": "skate",
  // Récupération
  sauna: "sauna",
  autre: "sauna",
  other: "sauna",
  // Autres
  rowing: "rameur",
  jumprope: "corde à sauter",
  kickboxing: "kickboxing",
  soccer: "football",
  racquetball: "racquetball",
};

/** Labels d'affichage avec emoji par type normalisé */
const WORKOUT_DISPLAY: Record<string, { label: string; emoji: string }> = {
  surf: { label: "Surf", emoji: "🏄" },
  musculation: { label: "Muscu", emoji: "💪" },
  yoga: { label: "Yoga", emoji: "🧘" },
  pilates: { label: "Pilates", emoji: "🧘" },
  natation: { label: "Natation", emoji: "🏊" },
  course: { label: "Course", emoji: "🏃" },
  marche: { label: "Marche", emoji: "🚶" },
  rando: { label: "Rando", emoji: "🥾" },
  vélo: { label: "Vélo", emoji: "🚴" },
  snowboard: { label: "Snowboard", emoji: "🏂" },
  skate: { label: "Skate", emoji: "🛹" },
  rameur: { label: "Rameur", emoji: "🚣" },
  "corde à sauter": { label: "Corde", emoji: "🪢" },
  kickboxing: { label: "Kickboxing", emoji: "🥊" },
  football: { label: "Football", emoji: "⚽" },
  racquetball: { label: "Racquetball", emoji: "🎾" },
  sauna: { label: "Sauna", emoji: "🥵" },
};

/** Normalise un type de workout DB vers un type planned activity */
export function normalizeWorkoutType(raw: string): string {
  return WORKOUT_TYPE_MAP[raw.toLowerCase()] ?? raw.toLowerCase();
}

/** Retourne le label d'affichage propre pour un type brut */
export function workoutDisplayLabel(raw: string): string {
  const normalized = normalizeWorkoutType(raw);
  return WORKOUT_DISPLAY[normalized]?.label ?? raw;
}

/** Retourne l'emoji pour un type brut */
export function workoutEmoji(raw: string): string {
  const normalized = normalizeWorkoutType(raw);
  return WORKOUT_DISPLAY[normalized]?.emoji ?? "🏅";
}

/**
 * Kcal moyennes estimées par type de planned activity.
 */
export const ESTIMATED_KCAL_PER_TYPE: Record<string, number> = {
  surf: 430,
  musculation: 250,
  yoga: 250,
  pilates: 200,
  natation: 340,
  course: 350,
  marche: 180,
  rando: 400,
  vélo: 350,
  snowboard: 350,
  skate: 200,
  rameur: 300,
  "corde à sauter": 300,
  kickboxing: 350,
  football: 400,
  sauna: 80,
  repos: 0,
};

/** Estime les kcal pour un type et un nombre de sessions */
export function estimateKcal(type: string, count: number): number {
  return (ESTIMATED_KCAL_PER_TYPE[type.toLowerCase()] ?? 200) * count;
}
