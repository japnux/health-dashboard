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

export type BookRequest = {
  users: SportigoUser[];
  eventId: string;
  roomId: number;
  dateLesson: string; // ISO transmis tel quel à Sportigo
  alsoBookReset?: {
    eventId: string;
    roomId: number;
    dateLesson: string;
  };
};

export type BookUserResult = {
  user: SportigoUser;
  accesLibre: { ok: boolean; reservationId?: string; error?: string };
  reset?: { ok: boolean; reservationId?: string; error?: string };
};

export type BookResponse = {
  results: BookUserResult[];
};
