import { cookies } from "next/headers";
import { createHash } from "crypto";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { BIOMARKER_CATEGORIES, BIOMARKERS_BY_KEY, getBiomarkerStatus } from "@/lib/biomarkers";
import { BiologieClient } from "./client";

export const dynamic = "force-dynamic";

async function isAuthenticated(): Promise<boolean> {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return false;
  const expected = createHash("sha256")
    .update(pw + "-hd-session")
    .digest("hex");
  const cookieStore = await cookies();
  return cookieStore.get("hd_session")?.value === expected;
}

type BloodTestResult = {
  id: string;
  biomarker_key: string;
  label: string;
  category: string;
  value: number;
  unit: string;
  ref_min: number | null;
  ref_max: number | null;
};

type BloodTest = {
  id: string;
  test_date: string;
  lab_name: string | null;
  notes: string | null;
  biological_age: number | null;
  blood_test_results: BloodTestResult[];
};

export type AttentionMarker = {
  biomarkerKey: string;
  label: string;
  category: string;
  value: number;
  unit: string;
  refMin: number | null;
  refMax: number | null;
  status: "borderline" | "out_of_range";
  trend: "degrading" | "stable" | "improving" | null;
  delta: number | null;
};

export default async function BiologiePage() {
  if (!(await isAuthenticated())) redirect("/login");

  const supabase = createServiceClient();

  const { data } = await supabase
    .from("blood_tests")
    .select("id, test_date, lab_name, notes, biological_age, blood_test_results(*)")
    .order("test_date", { ascending: false });

  const tests = (data ?? []) as BloodTest[];
  const latest = tests[0] ?? null;
  const previous = tests.length >= 2 ? tests[1] : null;

  // ── Marqueurs nécessitant attention ──
  const attentionMarkers: AttentionMarker[] = [];

  if (latest) {
    for (const r of latest.blood_test_results) {
      // Utiliser les plages du registre (source de vérité) plutôt que celles du PDF labo
      const def = BIOMARKERS_BY_KEY.get(r.biomarker_key);
      const effMin = def?.refMin ?? r.ref_min;
      const effMax = def?.refMax ?? r.ref_max;
      const status = getBiomarkerStatus(r.value, effMin, effMax);
      if (status === "optimal") continue;

      const prevResult = previous?.blood_test_results.find(
        (pr) => pr.biomarker_key === r.biomarker_key,
      );
      const delta = prevResult ? r.value - prevResult.value : null;

      let trend: AttentionMarker["trend"] = null;
      if (delta !== null && delta !== 0 && prevResult) {
        const prevStatus = getBiomarkerStatus(prevResult.value, effMin, effMax);
        // Dégradation = le marqueur s'éloigne de la plage optimale
        if (def?.lowerIsBetter) {
          trend = delta > 0 ? "degrading" : "improving";
        } else {
          // Hors plage basse → baisse = dégradation
          if (effMin != null && r.value < effMin) {
            trend = delta < 0 ? "degrading" : "improving";
          }
          // Hors plage haute → hausse = dégradation
          else if (effMax != null && r.value > effMax) {
            trend = delta > 0 ? "degrading" : "improving";
          }
          // Borderline → check vs previous
          else if (prevStatus === "optimal") {
            trend = "degrading";
          }
        }
      }

      attentionMarkers.push({
        biomarkerKey: r.biomarker_key,
        label: r.label,
        category: r.category,
        value: r.value,
        unit: r.unit,
        refMin: effMin,
        refMax: effMax,
        status: status as "borderline" | "out_of_range",
        trend,
        delta,
      });
    }
  }

  // Trier : out_of_range + degrading en premier
  attentionMarkers.sort((a, b) => {
    const score = (m: AttentionMarker) =>
      (m.status === "out_of_range" ? 10 : 0) + (m.trend === "degrading" ? 5 : 0);
    return score(b) - score(a);
  });

  // Préparer les données pour le client
  const testsForClient = tests.map((t) => {
    const resultsByCategory = new Map<string, BloodTestResult[]>();
    for (const r of t.blood_test_results) {
      const cat = r.category;
      if (!resultsByCategory.has(cat)) resultsByCategory.set(cat, []);
      resultsByCategory.get(cat)!.push(r);
    }

    const outOfRange = t.blood_test_results.filter((r) => {
      const d = BIOMARKERS_BY_KEY.get(r.biomarker_key);
      const status = getBiomarkerStatus(r.value, d?.refMin ?? r.ref_min, d?.refMax ?? r.ref_max);
      return status === "out_of_range";
    });

    return {
      ...t,
      resultsByCategory: Object.fromEntries(resultsByCategory),
      outOfRangeCount: outOfRange.length,
      totalMarkers: t.blood_test_results.length,
    };
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <BiologieClient
        tests={testsForClient}
        categories={BIOMARKER_CATEGORIES}
        attentionMarkers={attentionMarkers}
      />
    </main>
  );
}
