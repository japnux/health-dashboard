import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { withSession } from "@/lib/sportigo/auth";
import { bookEvent, SportigoNotConfiguredError } from "@/lib/sportigo/client";
import { isDashboardAuthenticated } from "@/lib/sportigo/dashboard-auth";
import type {
  BookResponse,
  BookSlotResult,
  BookUserResult,
  SportigoUser,
} from "@/lib/sportigo/types";

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
        } else {
          slotResults.push({ kind: slot.kind, ok: false, error: r.error });
        }
      }
      return { user, slots: slotResults };
    }),
  );

  const responseBody: BookResponse = { results: perUser };
  return NextResponse.json(responseBody);
}
