import { isAuthenticated } from "@/lib/session";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { BIOMARKERS_BY_KEY, biomarkerStatusFor } from "@/lib/biomarkers";
import { BiologieClient } from "./client";

export const dynamic = "force-dynamic";


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
  measuredAt: string; // date du bilan où ce marqueur a été mesuré en dernier
};

export default async function BiologiePage() {
  if (!(await isAuthenticated())) redirect("/login");

  const supabase = createServiceClient();

  const { data } = await supabase
    .from("blood_tests")
    .select("id, test_date, lab_name, notes, biological_age, blood_test_results(*)")
    .order("test_date", { ascending: false });

  const tests = (data ?? []) as BloodTest[];

  // ── Dernière mesure connue de chaque marqueur, tous bilans confondus ──
  // Avant, seul le dernier bilan comptait : un bilan partiel (urgences) faisait
  // disparaître la ferritine, la B12 ou la vitamine D mesurées avant.
  const latestByKey = new Map<string, { r: BloodTestResult; date: string; prev: BloodTestResult | null }>();
  for (const t of tests) {
    for (const r of t.blood_test_results) {
      const known = latestByKey.get(r.biomarker_key);
      if (!known) latestByKey.set(r.biomarker_key, { r, date: t.test_date, prev: null });
      else if (!known.prev) known.prev = r; // mesure précédente du même marqueur
    }
  }

  // ── Marqueurs nécessitant attention ──
  const attentionMarkers: AttentionMarker[] = [];

  for (const { r, date: measuredAt, prev: prevResult } of latestByKey.values()) {
      // Plage optimale du registre + normes du labo stockées avec le résultat
      const def = BIOMARKERS_BY_KEY.get(r.biomarker_key);
      const effMin = def ? def.refMin : r.ref_min;
      const effMax = def ? def.refMax : r.ref_max;
      const status = biomarkerStatusFor(r.biomarker_key, r.value, r.ref_min, r.ref_max);
      if (status === "optimal") continue;

      const delta = prevResult ? r.value - prevResult.value : null;

      let trend: AttentionMarker["trend"] = null;
      if (delta !== null && delta !== 0 && prevResult) {
        const prevStatus = biomarkerStatusFor(prevResult.biomarker_key, prevResult.value, prevResult.ref_min, prevResult.ref_max);
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
        measuredAt,
      });
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

    const outOfRange = t.blood_test_results.filter(
      (r) => biomarkerStatusFor(r.biomarker_key, r.value, r.ref_min, r.ref_max) === "out_of_range",
    );

    return {
      ...t,
      resultsByCategory: Object.fromEntries(resultsByCategory),
      outOfRangeCount: outOfRange.length,
      totalMarkers: t.blood_test_results.length,
    };
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <BiologieClient tests={testsForClient} attentionMarkers={attentionMarkers} />
    </main>
  );
}
