import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserTz } from "@/lib/user-tz";

// Automatisations Health Auto Export attendues (nom envoyé dans l'en-tête
// "automation-name"), pour le suivi de la dernière réception de chacune
const AUTOMATIONS = ["Health metrics", "Workouts"];

// GET            → 30 derniers envois (sans contenu brut) + état par automatisation
// GET ?id=<uuid> → contenu brut d'un envoi, chargé à la demande
export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const supabase = createServiceClient();
  const id = new URL(request.url).searchParams.get("id");

  if (id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
    const { data, error } = await supabase.from("sync_logs").select("raw_payload").eq("id", id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ raw_payload: data?.raw_payload ?? null });
  }

  const [{ data, error }, { data: recent }, tz] = await Promise.all([
    supabase
      .from("sync_logs")
      .select("id, created_at, source, status, summary, days_processed, workouts_processed, details, http_headers")
      .order("created_at", { ascending: false })
      .limit(30),
    // Plus large fenêtre pour retrouver la dernière réception de chaque automatisation
    supabase.from("sync_logs").select("created_at, status, http_headers").order("created_at", { ascending: false }).limit(200),
    getUserTz(supabase),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const nameOf = (h: unknown) => String((h as Record<string, unknown> | null)?.["automation-name"] ?? "");
  const automations = AUTOMATIONS.map((name) => {
    const last = (recent ?? []).find((l) => nameOf(l.http_headers) === name);
    return { name, lastAt: last?.created_at ?? null, status: last?.status ?? null };
  });

  return NextResponse.json({ logs: data ?? [], automations, tz });
}
