import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase/service";


export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("sync_logs")
    .select("id, created_at, source, status, summary, days_processed, workouts_processed, details, http_headers, raw_payload")
    .order("created_at", { ascending: false })
    .limit(7);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
