// Mapping des types de workout Apple Health → labels lisibles + icônes.

export const WORKOUT_TYPE_MAP: Record<string, { label: string; icon: string }> = {
  SurfingSports: { label: "Surf", icon: "🏄" },
  Surfing: { label: "Surf", icon: "🏄" },
  "Sports de Surf": { label: "Surf", icon: "🏄" },
  FunctionalStrengthTraining: { label: "Musculation", icon: "💪" },
  "Functional Strength Training": { label: "Musculation", icon: "💪" },
  "Entraînement de Force Fonctionnelle": { label: "Musculation", icon: "💪" },
  "Strength Training": { label: "Musculation", icon: "💪" },
  "Traditional Strength Training": { label: "Musculation", icon: "💪" },
  CrossTraining: { label: "Musculation", icon: "💪" },
  Running: { label: "Course", icon: "🏃" },
  "Outdoor Run": { label: "Course", icon: "🏃" },
  "Indoor Run": { label: "Course", icon: "🏃" },
  "Extérieur Course": { label: "Course", icon: "🏃" },
  "Intérieur Course": { label: "Course", icon: "🏃" },
  Swimming: { label: "Natation", icon: "🏊" },
  "Pool Swim": { label: "Natation", icon: "🏊" },
  "Open Water Swim": { label: "Natation", icon: "🏊" },
  "Piscine Nager": { label: "Natation", icon: "🏊" },
  Hiking: { label: "Rando", icon: "🥾" },
  Cycling: { label: "Vélo", icon: "🚴" },
  Walking: { label: "Marche", icon: "🚶" },
  Yoga: { label: "Yoga", icon: "🧘" },
  Pilates: { label: "Pilates", icon: "🤸" },
  Flexibility: { label: "Mobilité", icon: "🧘" },
  Snowboarding: { label: "Snowboard", icon: "🏂" },
  SkatingSports: { label: "Skate", icon: "🛹" },
  "Sports de Patinage": { label: "Skate", icon: "🛹" },
  Kickboxing: { label: "Kickboxing", icon: "🥊" },
  JumpRope: { label: "Corde à sauter", icon: "🪢" },
  Rowing: { label: "Rameur", icon: "🚣" },
  Soccer: { label: "Football", icon: "⚽" },
  WaterSports: { label: "Sports nautiques", icon: "🌊" },
  Racquetball: { label: "Racquetball", icon: "🎾" },
  sauna: { label: "Sauna", icon: "🥵" },
  Sauna: { label: "Sauna", icon: "🥵" },
  Autre: { label: "Sauna", icon: "🥵" },
  Other: { label: "Sauna", icon: "🥵" },
};

export function formatWorkoutType(raw: string | null): { label: string; icon: string } {
  if (!raw) return { label: "Sauna", icon: "🥵" };
  return WORKOUT_TYPE_MAP[raw] ?? { label: raw, icon: "🏃" };
}
