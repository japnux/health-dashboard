// Normalisation des events bruts Sportigo en PlanningSlot uniforme.
// La forme exacte de la réponse n'est pas documentée, on essaie plusieurs clés.

import type { RawPlanningEvent } from "./client";
import type { PlanningSlot } from "./types";
import { ROOM_ACCES_LIBRE, ROOM_THE_RESET } from "./types";

function pickString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function pickNumber(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return undefined;
}

function extractRoomId(ev: RawPlanningEvent): number | undefined {
  if (typeof ev.roomId === "number") return ev.roomId;
  if (ev.room && typeof ev.room === "object") {
    const rid = pickNumber((ev.room as Record<string, unknown>).id, (ev.room as Record<string, unknown>)._id);
    if (rid != null) return rid;
  }
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

export function normalizeEvent(ev: RawPlanningEvent): PlanningSlot | null {
  const eventId = pickString(ev._id, ev.id, (ev as Record<string, unknown>).eventId);
  const roomId = extractRoomId(ev);
  const start = pickString(ev.dateStart, ev.start, ev.startAt);
  const end = pickString(ev.dateEnd, ev.end, ev.endAt);
  if (!eventId || !roomId || !start || !end) return null;

  const capacity = pickNumber(ev.capacity, ev.maxBookings) ?? 0;
  const booked =
    pickNumber(ev.bookings, ev.countBookings, ev.reservationsCount, ev.bookedCount) ?? 0;
  const full = ev.isFull === true || (capacity > 0 && booked >= capacity);

  return {
    eventId,
    roomId,
    discipline: extractDiscipline(ev),
    start,
    end,
    capacity,
    booked,
    full,
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
    if (slot.roomId === ROOM_ACCES_LIBRE) accesLibre.push(slot);
    else if (slot.roomId === ROOM_THE_RESET) reset.push(slot);
  }
  const byStart = (a: PlanningSlot, b: PlanningSlot) => a.start.localeCompare(b.start);
  accesLibre.sort(byStart);
  reset.sort(byStart);
  return { accesLibre, reset };
}
