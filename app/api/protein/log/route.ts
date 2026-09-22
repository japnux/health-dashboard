import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { readJson } from "@/lib/http";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";

const bodySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format date attendu : YYYY-MM-DD"),
  grams: z.number().int().positive().max(500),
  source: z.string().optional(),
  label: z.string().optional(),
});

// Vérifie la session cookie (même logique que proxy.ts).

export async function DELETE(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const parsed = await readJson(request);
  if (parsed == null) return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  const { id } = parsed;
  if (!id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("protein_logs").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let parsed;
  try {
    const json = await request.json();
    parsed = bodySchema.parse(json);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Payload invalide" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("protein_logs").insert({
    date: parsed.date,
    grams: parsed.grams,
    source: parsed.source ?? "manual",
    label: parsed.label ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
