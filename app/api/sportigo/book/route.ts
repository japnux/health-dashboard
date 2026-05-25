import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { withSession } from "@/lib/sportigo/auth";
import { bookEvent, SportigoNotConfiguredError } from "@/lib/sportigo/client";
import { isDashboardAuthenticated } from "@/lib/sportigo/dashboard-auth";
import {
  createCalendarEvent,
  GoogleCalendarNotConfiguredError,
} from "@/lib/google-calendar";
import type {
  BookResponse,
  BookSlotResult,
  BookUserResult,
  SportigoUser,
} from "@/lib/sportigo/types";

const LAURIANE_EMAIL =
  process.env.LAURIANE_EMAIL ?? "laurianenagel@gmail.com";

// Durée d'un slot selon la room (Sportigo ne renvoie pas la fin dans `dateLesson`).
function slotDurationMinutes(roomId: number): number {
  if (roomId === 3539) return 30; // The Reset
  return 60; // Accès libre (room 3394) + fallback
}

function addMinutesToIsoLocal(isoLocal: string, mins: number): string {
  // isoLocal au format "YYYY-MM-DDTHH:mm:ss" (heure locale Paris).
  // On manipule via composants pour éviter les pièges de fuseau.
  const m = isoLocal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return isoLocal;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
  );
  date.setUTCMinutes(date.getUTCMinutes() + mins);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function slotSummary(slot: Slot, users: SportigoUser[]): string {
  const isReset = slot.roomId === 3539;
  const emoji = isReset ? "🥵" : "🏋️";
  const name = isReset ? "The Reset" : "Muscu (Accès libre)";
  const who =
    users.length === 2
      ? " · G+L"
      : users[0] === "lauriane"
        ? " · L"
        : "";
  return `${emoji} ${name}${who} — Novarc`;
}

const slotSchema = z.object({
  kind: z.string().min(1),
  eventId: z.string().min(1),
  roomId: z.number().int(),
  dateLesson: z.string().min(1),
  activity: z.string().optional(),
  discipline: z.string().optional(),
  disciplineId: z.number().int().optional(),
});

const bookSchema = z.object({
  users: z.array(z.enum(["geoffrey", "lauriane"])).min(1),
  slots: z.array(slotSchema).min(1),
});

type Slot = z.infer<typeof slotSchema>;

async function bookOne(
  user: SportigoUser,
  slot: Slot,
): Promise<{ ok: true; reservationId: string } | { ok: false; error: string }> {
  try {
    const { reservationId } = await withSession(user, (session) =>
      bookEvent(session.appToken, {
        roomId: slot.roomId,
        dateLesson: slot.dateLesson,
        eventID: slot.eventId,
        memberId: session.memberId,
        activity: slot.activity,
        disciplineId: slot.disciplineId,
      }),
    );
    return { ok: true, reservationId };
  } catch (err) {
    if (err instanceof SportigoNotConfiguredError) {
      return { ok: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return { ok: false, error: message };
  }
}

export async function POST(request: Request) {
  if (!(await isDashboardAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { users, slots } = parsed.data;
  const supabase = createServiceClient();

  // Auto-coche "Musculation" dans planned_activities si on book un Accès libre
  // (room 3394) et qu'elle n'est pas déjà cochée. Une seule fois pour la date du slot.
  async function ensurePlannedMusculation(date: string) {
    const { data } = await supabase
      .from("planned_activities")
      .select("count")
      .eq("date", date)
      .eq("type", "Musculation")
      .maybeSingle();
    const currentCount = data?.count ?? 0;
    if (currentCount < 1) {
      await supabase
        .from("planned_activities")
        .upsert(
          { date, type: "Musculation", count: 1 },
          { onConflict: "date,type" },
        )
        .then(({ error }) => {
          if (error) console.error("[sportigo/book] auto-plan Musculation:", error.message);
        });
    }
  }

  // Pour la création d'event Google Calendar à la fin : on track qui a réussi par slot.
  const successByEventId: Record<string, SportigoUser[]> = {};

  // Réservation parallèle entre users, séquentielle par slot pour chaque user.
  const perUser = await Promise.all(
    users.map(async (user): Promise<BookUserResult> => {
      const slotResults: BookSlotResult[] = [];
      for (const slot of slots) {
        const r = await bookOne(user, slot);
        if (r.ok) {
          slotResults.push({ kind: slot.kind, ok: true, reservationId: r.reservationId });
          await supabase
            .from("sportigo_reservations")
            .insert({
              user_key: user,
              reservation_id: r.reservationId,
              event_id: slot.eventId,
              room_id: slot.roomId,
              discipline: slot.discipline ?? slot.kind,
              date: slot.dateLesson.slice(0, 10),
              starts_at: slot.dateLesson,
            })
            .then(({ error }) => {
              if (error) console.error("[sportigo/book] insert:", error.message);
            });
          // Auto-coche Musculation pour ce jour si on vient de booker un Accès libre.
          if (slot.roomId === 3394) {
            await ensurePlannedMusculation(slot.dateLesson.slice(0, 10));
          }
          successByEventId[slot.eventId] ??= [];
          if (!successByEventId[slot.eventId].includes(user)) {
            successByEventId[slot.eventId].push(user);
          }
        } else {
          slotResults.push({ kind: slot.kind, ok: false, error: r.error });
        }
      }
      return { user, slots: slotResults };
    }),
  );

  // Création des événements Google Calendar (1 par slot effectivement booké).
  // Tous les events vont sur l'agenda principal de Geoffrey (refresh token).
  // Lauriane est invitée si elle fait partie des users bookés sur ce slot.
  for (const slot of slots) {
    const successUsers = successByEventId[slot.eventId];
    if (!successUsers || successUsers.length === 0) continue;
    try {
      const startLocal = slot.dateLesson.includes("T")
        ? slot.dateLesson.slice(0, 19)
        : slot.dateLesson.replace(" ", "T");
      const endLocal = addMinutesToIsoLocal(
        startLocal,
        slotDurationMinutes(slot.roomId),
      );
      await createCalendarEvent({
        summary: slotSummary(slot, successUsers),
        startIsoLocal: startLocal,
        endIsoLocal: endLocal,
        location: "Novarc",
        description: `Réservation Sportigo · ${successUsers
          .map((u) => (u === "geoffrey" ? "Geoffrey" : "Lauriane"))
          .join(" + ")}`,
        attendees: successUsers.includes("lauriane") ? [LAURIANE_EMAIL] : [],
      });
    } catch (err) {
      if (err instanceof GoogleCalendarNotConfiguredError) {
        // Pas grave : booking réussi côté Sportigo, le calendar est optionnel.
        console.warn("[sportigo/book] Google Calendar non configuré, on saute");
      } else {
        console.error("[sportigo/book] createCalendarEvent:", err);
      }
    }
  }

  const responseBody: BookResponse = { results: perUser };
  return NextResponse.json(responseBody);
}
