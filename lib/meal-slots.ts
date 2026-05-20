/**
 * Meal Slots — fonctions pures pour le découpage des repas en créneaux temporels
 * avec cibles macro dynamiques selon le profil d'activité du jour.
 */

import { normalizeWorkoutType } from "@/lib/workout-types";

// ─── Types ───────────────────────────────────────────────────────────

export type MealSlot = {
  id: string;
  label: string;
  startHour: number; // 0-23
  endHour: number;   // 0-23 (exclusif)
};

export type DayProfileId = "off" | "muscu" | "surf";

/** Répartition en % des macros par slot pour un profil donné */
export type DayProfile = Record<string, number>; // slotId → pourcentage (somme = 100)

export type DayProfilesConfig = Record<DayProfileId, DayProfile>;

export type SlotTargets = {
  calories: number;
  proteines_g: number;
  glucides_g: number;
  lipides_g: number;
};

export type SlotMealLog = {
  id: string;
  label: string | null;
  calories: number;
  proteines_g: number;
  glucides_g: number;
  lipides_g: number;
  logged_at: string;
};

export type SlotProteinLog = {
  id: string;
  grams: number;
  label: string | null;
  logged_at: string;
};

export type SlotState = {
  slot: MealSlot;
  targets: SlotTargets;
  /** Targets après redistribution des deltas des slots passés */
  adjustedTargets: SlotTargets;
  current: SlotTargets;
  meals: SlotMealLog[];
  proteinLogs: SlotProteinLog[];
  /** "past" | "active" | "future" */
  status: "past" | "active" | "future";
  /** Delta calories (current - targets) — négatif = sous-consommé */
  deltaKcal: number;
};

// ─── Constantes par défaut ───────────────────────────────────────────

export const DEFAULT_SLOTS: MealSlot[] = [
  { id: "petit_dej", label: "Petit-déjeuner", startHour: 6, endHour: 10 },
  { id: "collation_am", label: "Collation matin", startHour: 10, endHour: 12 },
  { id: "dejeuner", label: "Déjeuner", startHour: 12, endHour: 14 },
  { id: "collation_pm", label: "Goûter", startHour: 14, endHour: 18 },
  { id: "diner", label: "Dîner", startHour: 18, endHour: 22 },
];

export const DEFAULT_PROFILES: DayProfilesConfig = {
  off:   { petit_dej: 25, collation_am: 10, dejeuner: 30, collation_pm: 10, diner: 25 },
  muscu: { petit_dej: 20, collation_am: 15, dejeuner: 25, collation_pm: 15, diner: 25 },
  surf:  { petit_dej: 30, collation_am: 10, dejeuner: 25, collation_pm: 10, diner: 25 },
};

export const DAY_PROFILE_LABELS: Record<DayProfileId, string> = {
  off: "Standard",
  muscu: "Musculation",
  surf: "Surf",
};

// ─── Fonctions ───────────────────────────────────────────────────────

/**
 * Détecte le profil du jour selon les workouts réalisés et/ou prévus.
 * Priorité : surf > muscu > off.
 */
export function detectDayProfile(
  todayWorkouts: { type: string }[],
  plannedActivities: { type: string; count: number }[],
): DayProfileId {
  const allTypes = [
    ...todayWorkouts.map((w) => normalizeWorkoutType(w.type ?? "")),
    ...plannedActivities.map((p) => p.type.toLowerCase()),
  ];
  if (allTypes.includes("surf")) return "surf";
  if (allTypes.includes("musculation")) return "muscu";
  return "off";
}

/**
 * Assigne un log à un slot selon l'heure de logged_at (Europe/Paris).
 * Retourne le slotId correspondant, ou le slot le plus proche en fallback.
 */
export function assignSlot(loggedAt: string, slots: MealSlot[]): string {
  const hour = getParisHour(loggedAt);

  // Match direct
  for (const s of slots) {
    if (hour >= s.startHour && hour < s.endHour) return s.id;
  }

  // Fallback : slot le plus proche (avant minuit ou tôt le matin)
  let closest = slots[0];
  let minDist = Infinity;
  for (const s of slots) {
    const mid = (s.startHour + s.endHour) / 2;
    const dist = Math.abs(hour - mid);
    if (dist < minDist) {
      minDist = dist;
      closest = s;
    }
  }
  return closest.id;
}

/**
 * Calcule les targets par slot en appliquant les % du profil aux targets globaux.
 */
export function computeSlotTargets(
  profile: DayProfile,
  globalTargets: SlotTargets,
  slots: MealSlot[],
): Record<string, SlotTargets> {
  const result: Record<string, SlotTargets> = {};
  for (const s of slots) {
    const pct = (profile[s.id] ?? 0) / 100;
    result[s.id] = {
      calories: Math.round(globalTargets.calories * pct),
      proteines_g: Math.round(globalTargets.proteines_g * pct),
      glucides_g: Math.round(globalTargets.glucides_g * pct),
      lipides_g: Math.round(globalTargets.lipides_g * pct),
    };
  }
  return result;
}

/**
 * Calcule l'état de chaque slot : logs assignés, current vs target, status temporel.
 */
export function computeSlotStates(
  meals: SlotMealLog[],
  proteinLogs: SlotProteinLog[],
  slots: MealSlot[],
  slotTargets: Record<string, SlotTargets>,
  currentHour: number,
): SlotState[] {
  // Classifier les meals par slot
  const mealsBySlot = new Map<string, SlotMealLog[]>();
  const proteinsBySlot = new Map<string, SlotProteinLog[]>();
  for (const s of slots) {
    mealsBySlot.set(s.id, []);
    proteinsBySlot.set(s.id, []);
  }

  for (const m of meals) {
    const slotId = assignSlot(m.logged_at, slots);
    mealsBySlot.get(slotId)?.push(m);
  }
  for (const p of proteinLogs) {
    const slotId = assignSlot(p.logged_at, slots);
    proteinsBySlot.get(slotId)?.push(p);
  }

  return slots.map((slot) => {
    const slotMeals = mealsBySlot.get(slot.id) ?? [];
    const slotProteins = proteinsBySlot.get(slot.id) ?? [];
    const targets = slotTargets[slot.id] ?? { calories: 0, proteines_g: 0, glucides_g: 0, lipides_g: 0 };

    // Agréger les macros des meals
    const current: SlotTargets = {
      calories: slotMeals.reduce((s, m) => s + m.calories, 0),
      proteines_g: slotMeals.reduce((s, m) => s + m.proteines_g, 0) + slotProteins.reduce((s, p) => s + p.grams, 0),
      glucides_g: slotMeals.reduce((s, m) => s + m.glucides_g, 0),
      lipides_g: slotMeals.reduce((s, m) => s + m.lipides_g, 0),
    };

    // Déterminer le status temporel
    let status: "past" | "active" | "future";
    if (currentHour >= slot.endHour) {
      status = "past";
    } else if (currentHour >= slot.startHour) {
      status = "active";
    } else {
      status = "future";
    }

    return {
      slot,
      targets,
      adjustedTargets: { ...targets }, // sera modifié par redistributeDelta
      current,
      meals: slotMeals,
      proteinLogs: slotProteins,
      status,
      deltaKcal: current.calories - targets.calories,
    };
  });
}

/**
 * Redistribue le surplus/déficit des slots passés sur les slots futurs.
 * Ajuste principalement les glucides (même logique que l'ajustement quotidien).
 */
export function redistributeDelta(slotStates: SlotState[]): SlotState[] {
  // Sommer les deltas des slots passés
  let totalDeltaKcal = 0;
  let totalDeltaP = 0;
  let totalDeltaG = 0;
  let totalDeltaL = 0;

  for (const s of slotStates) {
    if (s.status === "past") {
      totalDeltaKcal += s.current.calories - s.targets.calories;
      totalDeltaP += s.current.proteines_g - s.targets.proteines_g;
      totalDeltaG += s.current.glucides_g - s.targets.glucides_g;
      totalDeltaL += s.current.lipides_g - s.targets.lipides_g;
    }
  }

  // Pas de redistribution si aucun delta
  if (totalDeltaKcal === 0 && totalDeltaP === 0 && totalDeltaG === 0 && totalDeltaL === 0) {
    return slotStates;
  }

  // Calculer le total des % des slots futurs (pour redistribution proportionnelle)
  const futureSlots = slotStates.filter((s) => s.status === "active" || s.status === "future");
  const totalFuturePct = futureSlots.reduce((sum, s) => {
    const originalCal = s.targets.calories;
    return sum + originalCal;
  }, 0);

  if (totalFuturePct === 0) return slotStates;

  return slotStates.map((s) => {
    if (s.status === "past") return s;

    // Proportion de ce slot parmi les slots futurs
    const ratio = s.targets.calories / totalFuturePct;

    // Soustraire le delta (si on a trop mangé, réduire les targets futurs)
    const adjustedTargets: SlotTargets = {
      calories: Math.max(0, Math.round(s.targets.calories - totalDeltaKcal * ratio)),
      proteines_g: Math.max(0, Math.round(s.targets.proteines_g - totalDeltaP * ratio)),
      glucides_g: Math.max(0, Math.round(s.targets.glucides_g - totalDeltaG * ratio)),
      lipides_g: Math.max(0, Math.round(s.targets.lipides_g - totalDeltaL * ratio)),
    };

    return { ...s, adjustedTargets };
  });
}

/**
 * Détermine le slot actif selon l'heure courante.
 */
export function getCurrentSlotId(slots: MealSlot[], currentHour: number): string | null {
  for (const s of slots) {
    if (currentHour >= s.startHour && currentHour < s.endHour) return s.id;
  }
  return null;
}

// ─── Helpers internes ────────────────────────────────────────────────

/** Extrait l'heure (0-23) d'un timestamp ISO en Europe/Paris. */
function getParisHour(iso: string): number {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    hour12: false,
    timeZone: "Europe/Paris",
  }).formatToParts(d);
  const hourPart = parts.find((p) => p.type === "hour");
  return parseInt(hourPart?.value ?? "12", 10);
}
