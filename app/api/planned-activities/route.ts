import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { readJson } from "@/lib/http";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";


const upsertSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.string().min(1),
  count: z.number().int().min(0).max(10),
});

// POST : incrémenter ou définir le count d'une activité prévue
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await readJson(request);
  if (body == null) return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { date, type, count } = parsed.data;
  const supabase = createServiceClient();

  if (count === 0) {
    // Supprimer l'entrée
    await supabase.from("planned_activities").delete().eq("date", date).eq("type", type);
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from("planned_activities").upsert(
    { date, type, count },
    { onConflict: "date,type" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
