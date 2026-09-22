import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { readJson } from "@/lib/http";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";


export async function DELETE(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const parsed = await readJson(request);
  if (parsed == null) return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  const { id } = parsed;
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
