import { NextResponse } from "next/server";
import { z } from "zod";
import { withAppToken } from "@/lib/sportigo/auth";
import { fetchPlanning, SportigoNotConfiguredError } from "@/lib/sportigo/client";
import { splitByRoom } from "@/lib/sportigo/normalize";
import { isDashboardAuthenticated } from "@/lib/sportigo/dashboard-auth";
import {
  ROOM_ACCES_LIBRE,
  ROOM_THE_RESET,
  type PlanningResponse,
} from "@/lib/sportigo/types";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: Request) {
  if (!(await isDashboardAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ date: url.searchParams.get("date") });
  if (!parsed.success) {
    return NextResponse.json({ error: "Paramètre date invalide" }, { status: 400 });
  }

  const { date } = parsed.data;

  try {
    // L'API /planningdx ne renvoie qu'une seule room par défaut. On fetch les 2 en parallèle :
    //   - room 3394 = Espace Sport (Accès libre)
    //   - room 3539 = Espace Wellness (The Reset + autres)
    const [sportEvents, wellnessEvents] = await withAppToken("geoffrey", async (token) => {
      return Promise.all([
        fetchPlanning(token, date, date, ROOM_ACCES_LIBRE),
        fetchPlanning(token, date, date, ROOM_THE_RESET),
      ]);
    });
    const { accesLibre, reset } = splitByRoom([...sportEvents, ...wellnessEvents]);
    const body: PlanningResponse = { date, accesLibre, reset };
    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof SportigoNotConfiguredError) {
      return NextResponse.json(
        { error: "SPORTIGO_NOT_CONFIGURED", message: err.message },
        { status: 503 },
      );
    }
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("[sportigo/planning] ", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
