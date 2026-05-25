import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { withAppToken } from "@/lib/sportigo/auth";
import {
  fetchMyReservations,
  fetchPlanning,
  SportigoNotConfiguredError,
} from "@/lib/sportigo/client";
import { normalizeEvent } from "@/lib/sportigo/normalize";
import { isDashboardAuthenticated } from "@/lib/sportigo/dashboard-auth";
import type {
  ActiveReservation,
  ReservationsResponse,
  SportigoUser,
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

export async function GET() {
  if (!(await isDashboardAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const date = todayParisDate();
  const supabase = createServiceClient();

  const { data: rows, error } = await supabase
    .from("sportigo_reservations")
    .select("id, user_key, reservation_id, event_id, room_id, discipline, date, starts_at")
    .eq("date", date);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const empty: ReservationsResponse = { date, geoffrey: [], lauriane: [] };
  if (!rows || rows.length === 0) return NextResponse.json(empty);

  // Réconciliation : source de vérité = Sportigo. On compare les reservation_id
  // Supabase aux résa actuelles côté Sportigo et on supprime les orphelines
  // (annulées par le propriétaire de la salle hors de notre app).
  const usersWithRows = Array.from(
    new Set(rows.map((r) => r.user_key as SportigoUser)),
  );
  const liveByUser: Record<string, Set<string>> = {};
  for (const user of usersWithRows) {
    try {
      const live = await fetchMyReservations(user);
      liveByUser[user] = new Set(live.map((r) => r.reservationId));
    } catch (err) {
      if (err instanceof SportigoNotConfiguredError) {
        console.warn("[sportigo/reservations] sync skip user (no creds):", user);
      } else {
        console.warn("[sportigo/reservations] sync échec pour", user, err);
      }
      // Si on n'arrive pas à vérifier, on garde les rows en DB pour ne pas perdre d'info.
      liveByUser[user] = new Set(
        rows.filter((r) => r.user_key === user).map((r) => r.reservation_id),
      );
    }
  }

  // Sépare rows valides (toujours côté Sportigo) et orphelines.
  const validRows: typeof rows = [];
  const orphanIds: string[] = [];
  for (const row of rows) {
    const userLive = liveByUser[row.user_key];
    if (userLive && userLive.has(row.reservation_id)) {
      validRows.push(row);
    } else {
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

  if (validRows.length === 0) return NextResponse.json(empty);

  // Récupération du planning pour enrichir les détails à jour (heures, etc.).
  let planningById = new Map<string, ReturnType<typeof normalizeEvent>>();
  try {
    const events = await withAppToken("geoffrey", (token) => fetchPlanning(token, date, date));
    for (const raw of events) {
      const slot = normalizeEvent(raw);
      if (slot) planningById.set(slot.eventId, slot);
    }
  } catch (err) {
    if (err instanceof SportigoNotConfiguredError) {
      // Pas de planning live disponible : on retombe sur les données Supabase brutes.
      console.warn("[sportigo/reservations] planning indisponible:", err.message);
    } else {
      console.warn("[sportigo/reservations] échec fetch planning, fallback DB:", err);
    }
    planningById = new Map();
  }

  const groups: ReservationsResponse = { date, geoffrey: [], lauriane: [] };
  for (const row of validRows) {
    const user = row.user_key as SportigoUser;
    if (user !== "geoffrey" && user !== "lauriane") continue;

    const live = planningById.get(row.event_id);
    const reservation: ActiveReservation = {
      id: row.id,
      user,
      reservationId: row.reservation_id,
      eventId: row.event_id,
      roomId: row.room_id,
      discipline: live?.discipline ?? row.discipline,
      start: live?.start ?? row.starts_at,
      end: live?.end ?? row.starts_at,
    };
    groups[user].push(reservation);
  }

  groups.geoffrey.sort((a, b) => a.start.localeCompare(b.start));
  groups.lauriane.sort((a, b) => a.start.localeCompare(b.start));

  return NextResponse.json(groups);
}
