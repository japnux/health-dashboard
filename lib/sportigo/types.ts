// Types pour l'API Sportigo (reverse-engineered).
// La forme exacte des réponses sera affinée à la première utilisation réelle.

export type SportigoUser = "geoffrey" | "lauriane";

export const ROOM_ACCES_LIBRE = 3394;
export const ROOM_THE_RESET = 3539;

// Slot retourné par notre route /api/sportigo/planning (forme normalisée).
export type PlanningSlot = {
  eventId: string;
  roomId: number;
  discipline: string;
  start: string; // ISO
  end: string; // ISO
  capacity: number;
  booked: number;
  full: boolean;
  // roomType Sportigo (ex: "cours-co", "coaching") — sert à router vers le bon endpoint.
  activity?: string;
  // disciplineId Sportigo, requis pour booker un slot coaching (The Reset).
  disciplineId?: number;
};

export type PlanningResponse = {
  date: string; // YYYY-MM-DD
  accesLibre: PlanningSlot[];
  reset: PlanningSlot[];
};

// Réservation côté UI : croisement Supabase + planning live.
export type ActiveReservation = {
  id: string; // UUID local Supabase
  user: SportigoUser;
  reservationId: string;
  eventId: string;
  roomId: number;
  discipline: string;
  start: string; // ISO
  end: string; // ISO
};

export type ReservationsResponse = {
  date: string;
  geoffrey: ActiveReservation[];
  lauriane: ActiveReservation[];
};

export type BookSlotInput = {
  // Identifie le créneau côté UI ("accesLibre" | "reset" ou autre clé libre)
  // pour permettre de mapper les résultats par slot dans la réponse.
  kind: string;
  eventId: string;
  roomId: number;
  dateLesson: string;
  activity?: string;
  discipline?: string;
};

export type BookRequest = {
  users: SportigoUser[];
  slots: BookSlotInput[];
};

export type BookSlotResult = {
  kind: string;
  ok: boolean;
  reservationId?: string;
  error?: string;
};

export type BookUserResult = {
  user: SportigoUser;
  slots: BookSlotResult[];
};

export type BookResponse = {
  results: BookUserResult[];
};
