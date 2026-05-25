import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { withAppToken } from "@/lib/sportigo/auth";
import { bookEvent, SportigoNotConfiguredError } from "@/lib/sportigo/client";
import { isDashboardAuthenticated } from "@/lib/sportigo/dashboard-auth";
import type {
  BookResponse,
  BookUserResult,
  SportigoUser,
} from "@/lib/sportigo/types";

const subSlotSchema = z.object({
  eventId: z.string().min(1),
  roomId: z.number().int(),
  dateLesson: z.string().min(1),
});

const bookSchema = z.object({
  users: z.array(z.enum(["geoffrey", "lauriane"])).min(1),
  eventId: z.string().min(1),
  roomId: z.number().int(),
  dateLesson: z.string().min(1),
  discipline: z.string().optional(),
  alsoBookReset: subSlotSchema.optional(),
  resetDiscipline: z.string().optional(),
});

type Slot = z.infer<typeof subSlotSchema>;

async function bookOne(
  user: SportigoUser,
  slot: Slot,
): Promise<{ ok: true; reservationId: string } | { ok: false; error: string }> {
  try {
    const { reservationId } = await withAppToken(user, (token) =>
      bookEvent(token, {
        roomId: slot.roomId,
        dateLesson: slot.dateLesson,
        eventID: slot.eventId,
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

  const {
    users,
    eventId,
    roomId,
    dateLesson,
    discipline,
    alsoBookReset,
    resetDiscipline,
  } = parsed.data;

  const supabase = createServiceClient();
  const dateOnly = dateLesson.slice(0, 10); // YYYY-MM-DD

  // Réservation parallèle entre users, mais séquentiel par user (accès libre puis reset).
  const perUser = await Promise.all(
    users.map(async (user): Promise<BookUserResult> => {
      const accesRes = await bookOne(user, { eventId, roomId, dateLesson });
      const result: BookUserResult = { user, accesLibre: accesRes };

      if (accesRes.ok) {
        await supabase
          .from("sportigo_reservations")
          .insert({
            user_key: user,
            reservation_id: accesRes.reservationId,
            event_id: eventId,
            room_id: roomId,
            discipline: discipline ?? "Accès libre",
            date: dateOnly,
            starts_at: dateLesson,
          })
          .then(({ error }) => {
            if (error) console.error("[sportigo/book] insert acces:", error.message);
          });
      }

      if (alsoBookReset) {
        const resetRes = await bookOne(user, alsoBookReset);
        result.reset = resetRes;
        if (resetRes.ok) {
          await supabase
            .from("sportigo_reservations")
            .insert({
              user_key: user,
              reservation_id: resetRes.reservationId,
              event_id: alsoBookReset.eventId,
              room_id: alsoBookReset.roomId,
              discipline: resetDiscipline ?? "The Reset",
              date: alsoBookReset.dateLesson.slice(0, 10),
              starts_at: alsoBookReset.dateLesson,
            })
            .then(({ error }) => {
              if (error) console.error("[sportigo/book] insert reset:", error.message);
            });
        }
      }

      return result;
    }),
  );

  const responseBody: BookResponse = { results: perUser };
  return NextResponse.json(responseBody);
}
