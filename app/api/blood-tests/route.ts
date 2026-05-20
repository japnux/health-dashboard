import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { BIOMARKERS_BY_KEY } from "@/lib/biomarkers";

async function isAuthenticated(): Promise<boolean> {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return false;
  const expected = createHash("sha256")
    .update(pw + "-hd-session")
    .digest("hex");
  const cookieStore = await cookies();
  return cookieStore.get("hd_session")?.value === expected;
}

// ─── GET — Liste des bilans sanguins ────────────────────────────────

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const url = new URL(request.url);
  const latestOnly = url.searchParams.get("latest") === "true";

  const supabase = createServiceClient();

  let query = supabase
    .from("blood_tests")
    .select("id, test_date, lab_name, notes, biological_age, created_at, blood_test_results(*)")
    .order("test_date", { ascending: false });

  if (latestOnly) {
    query = query.limit(2); // dernier + précédent pour delta
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tests: data ?? [] });
}

// ─── POST — Créer/mettre à jour un bilan sanguin ───────────────────

type ResultInput = {
  biomarker_key: string;
  value: number;
  unit?: string;
  ref_min?: number | null;
  ref_max?: number | null;
};

type BloodTestInput = {
  test_date: string;
  lab_name?: string;
  notes?: string;
  biological_age?: number;
  results: ResultInput[];
};

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let body: BloodTestInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  if (!body.test_date || !body.results?.length) {
    return NextResponse.json(
      { error: "test_date et results[] sont requis" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // 1. Upsert du bilan parent (unique sur test_date)
  const { data: testData, error: testError } = await supabase
    .from("blood_tests")
    .upsert(
      {
        test_date: body.test_date,
        lab_name: body.lab_name ?? null,
        notes: body.notes ?? null,
        biological_age: body.biological_age ?? null,
      },
      { onConflict: "test_date" },
    )
    .select("id")
    .single();

  if (testError || !testData) {
    return NextResponse.json(
      { error: `Erreur création bilan : ${testError?.message}` },
      { status: 500 },
    );
  }

  const testId = testData.id;

  // 2. Préparer les résultats avec enrichissement depuis le registre
  const resultRows = body.results
    .filter((r) => r.biomarker_key && r.value != null)
    .map((r) => {
      const def = BIOMARKERS_BY_KEY.get(r.biomarker_key);
      return {
        test_id: testId,
        biomarker_key: r.biomarker_key,
        label: def?.label ?? r.biomarker_key,
        category: def?.category ?? "autre",
        value: r.value,
        unit: r.unit ?? def?.unit ?? "",
        ref_min: r.ref_min ?? def?.refMin ?? null,
        ref_max: r.ref_max ?? def?.refMax ?? null,
      };
    });

  // 3. Upsert des résultats (unique sur test_id + biomarker_key)
  const { error: resultsError } = await supabase
    .from("blood_test_results")
    .upsert(resultRows, { onConflict: "test_id,biomarker_key" });

  if (resultsError) {
    return NextResponse.json(
      { error: `Erreur résultats : ${resultsError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    test_id: testId,
    results_count: resultRows.length,
  });
}

// ─── DELETE — Supprimer un bilan ────────────────────────────────────

export async function DELETE(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const url = new URL(request.url);
  const testId = url.searchParams.get("id");

  if (!testId) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // CASCADE supprime aussi les blood_test_results
  const { error } = await supabase.from("blood_tests").delete().eq("id", testId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
