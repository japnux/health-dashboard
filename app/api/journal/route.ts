import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
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

  const body = await request.json();
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
