import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { readJson } from "@/lib/http";
import { createServiceClient } from "@/lib/supabase/service";


export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "date requise" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("date", date)
    .maybeSingle();

  return NextResponse.json({ entry: data });
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await readJson(request);
  if (body == null) return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  const { date, mood, energy, stress, notes, gratitude } = body;

  if (!date) {
    return NextResponse.json({ error: "date requise" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("journal_entries").upsert(
    {
      date,
      mood: mood ?? null,
      energy: energy ?? null,
      stress: stress ?? null,
      notes: notes ?? null,
      gratitude: gratitude ?? null,
    },
    { onConflict: "date" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
