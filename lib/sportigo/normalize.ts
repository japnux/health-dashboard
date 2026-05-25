// Normalisation des events bruts Sportigo en PlanningSlot uniforme.
// Forme observée (mai 2026) :
//   { id, discipline, startDate: "YYYY-MM-DD HH:mm:ss", endDate, room: number,
//     maxMember, reservation, ... }

import type { RawPlanningEvent } from "./client";
import type { PlanningSlot } from "./types";
import { ROOM_ACCES_LIBRE, ROOM_THE_RESET } from "./types";

function pickString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function pickNumber(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  return undefined;
}

function extractRoomId(ev: RawPlanningEvent): number | undefined {
  // L'API renvoie `room` directement comme number.
  if (typeof ev.room === "number") return ev.room;
  if (typeof ev.room === "string") {
    const n = Number(ev.room);
    if (Number.isFinite(n)) return n;
  }
  if (ev.room && typeof ev.room === "object") {
    const r = ev.room as Record<string, unknown>;
    return pickNumber(r.id, r._id);
  }
  if (typeof ev.roomId === "number") return ev.roomId;
  return pickNumber(ev.roomId);
}

function extractDiscipline(ev: RawPlanningEvent): string {
  if (typeof ev.discipline === "string") return ev.discipline;
  if (ev.discipline && typeof ev.discipline === "object") {
    const name = (ev.discipline as { name?: string }).name;
    if (name) return name;
  }
  return ev.name ?? "";
}

// Convertit "YYYY-MM-DD HH:mm:ss" (heure locale Paris) en ISO local "YYYY-MM-DDTHH:mm:ss".
// `new Date(iso)` est plus fiable dans tous les navigateurs avec le séparateur "T".
function toIsoLocal(s: string | undefined): string | undefined {
  if (!s) return undefined;
  if (s.includes("T")) return s;
  return s.replace(" ", "T");
}

export function normalizeEvent(ev: RawPlanningEvent): PlanningSlot | null {
  const eventId = pickString(
    (ev as Record<string, unknown>).id,
    ev._id,
    (ev as Record<string, unknown>).eventId,
  );
  const roomId = extractRoomId(ev);
  const start = toIsoLocal(pickString(ev.startDate, ev.dateStart, ev.start, ev.startAt));
  const end = toIsoLocal(pickString(ev.endDate, ev.dateEnd, ev.end, ev.endAt));
  if (!eventId || roomId == null || !start || !end) return null;

  const capacity =
    pickNumber(
      (ev as Record<string, unknown>).maxMember,
      ev.capacity,
      ev.maxBookings,
    ) ?? 0;
  const booked =
    pickNumber(
      (ev as Record<string, unknown>).reservation,
      ev.bookings,
      ev.countBookings,
      ev.reservationsCount,
      ev.bookedCount,
    ) ?? 0;
  const full = ev.isFull === true || (capacity > 0 && booked >= capacity);

  const activity = pickString((ev as Record<string, unknown>).roomType);
  const disciplineId = pickNumber((ev as Record<string, unknown>).disciplineId);

  return {
    eventId,
    roomId,
    discipline: extractDiscipline(ev),
    start,
    end,
    capacity,
    booked,
    full,
    activity,
    disciplineId,
  };
}

export function splitByRoom(events: RawPlanningEvent[]): {
  accesLibre: PlanningSlot[];
  reset: PlanningSlot[];
} {
  const accesLibre: PlanningSlot[] = [];
  const reset: PlanningSlot[] = [];
  for (const raw of events) {
    const slot = normalizeEvent(raw);
    if (!slot) continue;
    // Accès libre = room 3394.
    if (slot.roomId === ROOM_ACCES_LIBRE) {
      accesLibre.push(slot);
      continue;
    }
    // The Reset = room 3539 + discipline contenant "Reset" (la room 3539 héberge aussi Cold Therapy, etc.).
    if (slot.roomId === ROOM_THE_RESET && /reset/i.test(slot.discipline)) {
      reset.push(slot);
    }
  }
  const byStart = (a: PlanningSlot, b: PlanningSlot) => a.start.localeCompare(b.start);
  accesLibre.sort(byStart);
  reset.sort(byStart);
  return { accesLibre, reset };
}
