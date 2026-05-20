import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { cookies } from "next/headers";
import { createHash } from "crypto";

async function isAuthenticated(): Promise<boolean> {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return false;
  const expected = createHash("sha256").update(pw + "-hd-session").digest("hex");
  const cookieStore = await cookies();
  return cookieStore.get("hd_session")?.value === expected;
}

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

  const body = await request.json();
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
