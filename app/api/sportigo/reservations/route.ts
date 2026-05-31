import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { withAppToken } from "@/lib/sportigo/auth";
import {
  fetchMyReservations,
  fetchPlanning,
  SportigoNotConfiguredError,
  type LiveReservation,
} from "@/lib/sportigo/client";
import { normalizeEvent } from "@/lib/sportigo/normalize";
import { isDashboardAuthenticated } from "@/lib/sportigo/dashboard-auth";
import {
  ROOM_ACCES_LIBRE,
  ROOM_THE_RESET,
  type ActiveReservation,
  type ReservationsResponse,
  type SportigoUser,
} from "@/lib/sportigo/types";

function todayParisDate(): string {
  // Date du jour au format YYYY-MM-DD, fuseau Europe/Paris.
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

// Type de ligne dans la table sportigo_reservations.
type DbRow = {
  id: string;
  user_key: string;
  reservation_id: string;
  event_id: string;
  room_id: number;
  discipline: string;
  date: string;
  starts_at: string;
};

const USERS: SportigoUser[] = ["geoffrey", "lauriane"];

// Convertit "YYYY-MM-DD HH:mm:ss" (heure Paris) en ISO local (string).
function toIsoLocal(s: string | undefined): string | undefined {
  if (!s) return undefined;
  return s.includes("T") ? s : s.replace(" ", "T");
}

export async function GET() {
  if (!(await isDashboardAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const date = todayParisDate();
  const supabase = createServiceClient();

  // 1) Snapshot DB pour la date du jour.
  const { data: rowsRaw, error } = await supabase
    .from("sportigo_reservations")
    .select("id, user_key, reservation_id, event_id, room_id, discipline, date, starts_at")
    .eq("date", date);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows: DbRow[] = rowsRaw ?? [];

  // 2) Sync bidirectionnelle avec Sportigo pour les 2 users.
  //    - delete : row Supabase qui n'existe plus côté Sportigo (annulé par la salle)
  //    - insert : résa côté Sportigo qui n'est pas dans Supabase (booké hors de l'app)
  const liveByUser: Record<SportigoUser, LiveReservation[]> = {
    geoffrey: [],
    lauriane: [],
  };
  for (const user of USERS) {
    try {
      liveByUser[user] = await fetchMyReservations(user);
    } catch (err) {
      if (err instanceof SportigoNotConfiguredError) {
        console.warn("[sportigo/reservations] sync skip user (no creds):", user);
      } else {
        console.warn("[sportigo/reservations] sync échec pour", user, err);
      }
      // En échec, on retombe sur les rows DB existantes pour ce user.
      liveByUser[user] = rows
        .filter((r) => r.user_key === user)
        .map((r) => ({ reservationId: r.reservation_id }));
    }
  }

  // Purge des orphelines (DB mais pas chez Sportigo).
  const orphanIds: string[] = [];
  for (const row of rows) {
    const user = row.user_key as SportigoUser;
    const live = liveByUser[user];
    if (!live.some((r) => r.reservationId === row.reservation_id)) {
      orphanIds.push(row.id);
    }
  }
  if (orphanIds.length > 0) {
    const { error: delErr } = await supabase
      .from("sportigo_reservations")
      .delete()
      .in("id", orphanIds);
    if (delErr) {
      console.error("[sportigo/reservations] purge orphelines:", delErr.message);
    } else {
      console.log(
        `[sportigo/reservations] purge ${orphanIds.length} résa(s) annulée(s) côté salle`,
      );
    }
  }

  // Ingest des résa Sportigo manquantes en DB pour la date du jour.
  const knownIds = new Set(rows.map((r) => r.reservation_id));
  type Insert = {
    user_key: SportigoUser;
    reservation_id: string;
    event_id: string;
    room_id: number;
    discipline: string;
    date: string;
    starts_at: string;
  };
  const toInsert: Insert[] = [];
  for (const user of USERS) {
    for (const live of liveByUser[user]) {
      if (knownIds.has(live.reservationId)) continue;
      if (!live.startDate) continue;
      // Filtre sur la date du jour Paris.
      if (!live.startDate.startsWith(date)) continue;
      if (live.room == null || !live.discipline) continue;
      toInsert.push({
        user_key: user,
        reservation_id: live.reservationId,
        event_id: live.eventId ?? live.reservationId,
        room_id: live.room,
        discipline: live.discipline,
        date,
        starts_at: live.startDate,
      });
    }
  }
  let insertedRows: DbRow[] = [];
  if (toInsert.length > 0) {
    const { data, error: insErr } = await supabase
      .from("sportigo_reservations")
      .upsert(toInsert, { onConflict: "user_key,reservation_id" })
      .select("id, user_key, reservation_id, event_id, room_id, discipline, date, starts_at");
    if (insErr) {
      console.error("[sportigo/reservations] ingest échec:", insErr.message);
    } else {
      insertedRows = (data as DbRow[]) ?? [];
      console.log(
        `[sportigo/reservations] ingest ${insertedRows.length} résa(s) bookée(s) hors de l'app`,
      );
    }
  }

  // 3) Rows valides après sync : non-orphelines + nouvellement ingérées.
  const validRows: DbRow[] = rows
    .filter((r) => !orphanIds.includes(r.id))
    .concat(insertedRows);

  const empty: ReservationsResponse = { date, geoffrey: [], lauriane: [] };
  if (validRows.length === 0) return NextResponse.json(empty);

  // 4) Enrichissement via planning (heures, capacité à jour, etc.).
  let planningById = new Map<string, ReturnType<typeof normalizeEvent>>();
  try {
    const [sportEvents, wellnessEvents] = await withAppToken("geoffrey", async (token) =>
      Promise.all([
        fetchPlanning(token, date, date, ROOM_ACCES_LIBRE),
        fetchPlanning(token, date, date, ROOM_THE_RESET),
      ]),
    );
    for (const raw of [...sportEvents, ...wellnessEvents]) {
      const slot = normalizeEvent(raw);
      if (slot) planningById.set(slot.eventId, slot);
    }
  } catch (err) {
    if (err instanceof SportigoNotConfiguredError) {
      console.warn("[sportigo/reservations] planning indisponible:", err.message);
    } else {
      console.warn("[sportigo/reservations] échec fetch planning, fallback DB:", err);
    }
    planningById = new Map();
  }

  // Index des résa live par reservationId (pour enrichir avec endDate quand le planning ne matche pas).
  const liveByResId = new Map<string, LiveReservation>();
  for (const user of USERS) {
    for (const live of liveByUser[user]) liveByResId.set(live.reservationId, live);
  }

  function deriveEnd(starts: string, roomId: number): string {
    // Durée par défaut : 60min Accès libre, 30min Reset.
    const m = starts.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return starts;
    const mins = roomId === ROOM_THE_RESET ? 30 : 60;
    const d = new Date(
      Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]),
    );
    d.setUTCMinutes(d.getUTCMinutes() + mins);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  }

  const groups: ReservationsResponse = { date, geoffrey: [], lauriane: [] };
  for (const row of validRows) {
    const user = row.user_key as SportigoUser;
    if (user !== "geoffrey" && user !== "lauriane") continue;

    const planning = planningById.get(row.event_id);
    const live = liveByResId.get(row.reservation_id);
    const startIso =
      planning?.start ?? toIsoLocal(live?.startDate) ?? toIsoLocal(row.starts_at) ?? row.starts_at;
    const endIso =
      planning?.end ?? toIsoLocal(live?.endDate) ?? deriveEnd(startIso, row.room_id);

    const reservation: ActiveReservation = {
      id: row.id,
      user,
      reservationId: row.reservation_id,
      eventId: row.event_id,
      roomId: row.room_id,
      discipline: planning?.discipline ?? live?.discipline ?? row.discipline,
      start: startIso,
      end: endIso,
    };
    groups[user].push(reservation);
  }

  groups.geoffrey.sort((a, b) => a.start.localeCompare(b.start));
  groups.lauriane.sort((a, b) => a.start.localeCompare(b.start));

  return NextResponse.json(groups);
}
