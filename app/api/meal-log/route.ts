import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";

async function isAuthenticated(): Promise<boolean> {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return false;
  const expected = createHash("sha256")
    .update(pw + "-hd-session")
    .digest("hex");
  const cookieStore = await cookies();
  return cookieStore.get("hd_session")?.value === expected;
}

export async function DELETE(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "ID requis" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("meal_logs").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

const postSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().optional(),
  source: z.string().optional(),
  calories: z.number().min(0).max(5000),
  proteines_g: z.number().min(0).max(500),
  glucides_g: z.number().min(0).max(1000),
  lipides_g: z.number().min(0).max(500),
});

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = postSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Payload invalide" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("meal_logs").insert({
    date: parsed.date,
    label: parsed.label ?? null,
    source: parsed.source ?? "manual",
    calories: parsed.calories,
    proteines_g: parsed.proteines_g,
    glucides_g: parsed.glucides_g,
    lipides_g: parsed.lipides_g,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
