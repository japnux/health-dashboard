import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { withSession } from "@/lib/sportigo/auth";
import {
  cancelReservation,
  SportigoApiError,
  SportigoNotConfiguredError,
} from "@/lib/sportigo/client";
import { isDashboardAuthenticated } from "@/lib/sportigo/dashboard-auth";
import type { SportigoUser } from "@/lib/sportigo/types";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  if (!(await isDashboardAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "ID manquant" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: row, error: readErr } = await supabase
    .from("sportigo_reservations")
    .select("id, user_key, reservation_id")
    .eq("id", id)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Réservation introuvable" }, { status: 404 });
  }

  const user = row.user_key as SportigoUser;

  try {
    await withSession(user, (session) =>
      cancelReservation(session.appToken, row.reservation_id, session.memberId),
    );
  } catch (err) {
    if (err instanceof SportigoNotConfiguredError) {
      return NextResponse.json(
        { error: "SPORTIGO_NOT_CONFIGURED", message: err.message },
        { status: 503 },
      );
    }
    // Log structuré pour diagnostiquer l'erreur Sportigo.
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    const payload =
      err instanceof SportigoApiError ? JSON.stringify(err.payload) : undefined;
    console.error(
      `[sportigo/reservations DELETE] user=${user} resaId=${row.reservation_id} error=${message} payload=${payload}`,
    );
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const { error: delErr } = await supabase
    .from("sportigo_reservations")
    .delete()
    .eq("id", id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
