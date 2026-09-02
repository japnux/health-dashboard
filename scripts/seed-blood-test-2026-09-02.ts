// Seed: bilan biologie urgences Hôpital Paris Saint-Joseph du 02/09/2026
// Usage: npx tsx scripts/seed-blood-test-2026-09-02.ts

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Charger .env.local manuellement (pas de dépendance dotenv)
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("Variables SUPABASE manquantes dans .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Result = {
  category: string;
  biomarker_key: string;
  label: string;
  value: number;
  unit: string;
  ref_min: number | null;
  ref_max: number | null;
};

const results: Result[] = [
  // ── Ionogramme ──
  { category: "ionogramme", biomarker_key: "sodium", label: "Sodium", value: 141, unit: "mmol/l", ref_min: 136, ref_max: 145 },
  { category: "ionogramme", biomarker_key: "potassium", label: "Potassium", value: 4.0, unit: "mmol/l", ref_min: 3.5, ref_max: 5.1 },
  { category: "ionogramme", biomarker_key: "chlore", label: "Chlore", value: 111, unit: "mmol/l", ref_min: 98, ref_max: 107 },
  { category: "ionogramme", biomarker_key: "bicarbonates", label: "Bicarbonates", value: 20, unit: "mmol/l", ref_min: 22, ref_max: 29 },
  { category: "ionogramme", biomarker_key: "protides", label: "Protides plasmatiques", value: 73, unit: "g/l", ref_min: 63, ref_max: 81 },

  // ── Métabolique ──
  { category: "metabolique", biomarker_key: "fasting_glucose", label: "Glycémie", value: 1.20, unit: "g/L", ref_min: 0.74, ref_max: 1.01 },
  { category: "metabolique", biomarker_key: "urea", label: "Urée", value: 0.300, unit: "g/L", ref_min: 0.19, ref_max: 0.44 },

  // ── Reins ──
  { category: "reins", biomarker_key: "creatinine", label: "Créatinine", value: 0.758, unit: "mg/dL", ref_min: 0.72, ref_max: 1.18 },
  { category: "reins", biomarker_key: "egfr", label: "DFG estimé (CKD-EPI)", value: 113.6, unit: "mL/min", ref_min: null, ref_max: null },

  // ── Cardiaque ──
  { category: "cardiaque", biomarker_key: "troponin_i", label: "Troponine I HS", value: 3.2, unit: "ng/l", ref_min: null, ref_max: 26.0 },
  { category: "cardiaque", biomarker_key: "bnp", label: "BNP", value: 10, unit: "ng/l", ref_min: null, ref_max: 100 },

  // ── Inflammation ──
  { category: "inflammation", biomarker_key: "crp", label: "CRP", value: 4, unit: "mg/l", ref_min: null, ref_max: 5.0 },
  { category: "inflammation", biomarker_key: "wbc", label: "Leucocytes", value: 10.19, unit: "giga/L", ref_min: 4.00, ref_max: 11.00 },

  // ── Hématologie - NFS ──
  { category: "hematologie", biomarker_key: "rbc", label: "Hématies", value: 5.15, unit: "T/L", ref_min: 4.30, ref_max: 6.00 },
  { category: "hematologie", biomarker_key: "hemoglobin", label: "Hémoglobine", value: 15.3, unit: "g/dl", ref_min: 13.0, ref_max: 18.0 },
  { category: "hematologie", biomarker_key: "hematocrit", label: "Hématocrite", value: 42.9, unit: "%", ref_min: 39.0, ref_max: 53.0 },
  { category: "hematologie", biomarker_key: "mcv", label: "VGM", value: 83, unit: "fl", ref_min: 78, ref_max: 98 },
  { category: "hematologie", biomarker_key: "mch", label: "TCMH", value: 29.7, unit: "pg", ref_min: 26.0, ref_max: 34.0 },
  { category: "hematologie", biomarker_key: "mchc", label: "CCMH", value: 35.7, unit: "g/dl", ref_min: 31.0, ref_max: 36.5 },
  { category: "hematologie", biomarker_key: "rdw", label: "IDR-CV", value: 11.7, unit: "%", ref_min: 12.0, ref_max: 14.3 },
  { category: "hematologie", biomarker_key: "platelets", label: "Plaquettes", value: 251, unit: "G/L", ref_min: 150, ref_max: 400 },
  { category: "hematologie", biomarker_key: "mpv", label: "VPM", value: 9.9, unit: "fl", ref_min: 9.1, ref_max: 12.1 },
  { category: "hematologie", biomarker_key: "neutrophils", label: "PNN", value: 8.28, unit: "G/L", ref_min: 1.40, ref_max: 7.70 },
  { category: "hematologie", biomarker_key: "eosinophils", label: "PNE", value: 0.07, unit: "G/L", ref_min: 0.02, ref_max: 0.63 },
  { category: "hematologie", biomarker_key: "basophils", label: "PNB", value: 0.02, unit: "G/L", ref_min: null, ref_max: null },
  { category: "hematologie", biomarker_key: "lymphocytes", label: "Lymphocytes", value: 1.31, unit: "G/L", ref_min: 1.00, ref_max: 4.80 },
  { category: "hematologie", biomarker_key: "monocytes", label: "Monocytes", value: 0.50, unit: "G/L", ref_min: 0.18, ref_max: 1.00 },

  // ── Hémostase ──
  { category: "hemostase", biomarker_key: "tca_ratio", label: "TCA ratio", value: 0.94, unit: "ratio", ref_min: 0.80, ref_max: 1.20 },
  { category: "hemostase", biomarker_key: "tp", label: "Taux de prothrombine", value: 102, unit: "%", ref_min: 70, ref_max: 120 },
  { category: "hemostase", biomarker_key: "d_dimers", label: "D-Dimères", value: 574, unit: "ng/ml", ref_min: null, ref_max: 500 },
];

async function main() {
  // 1. Upsert du bilan parent
  const { data: testData, error: testError } = await supabase
    .from("blood_tests")
    .upsert(
      {
        test_date: "2026-09-02",
        lab_name: "Hôpitaux Paris Saint-Joseph",
        notes: "Bilan urgences CX - prélèvement 01h45. Glycémie non à jeun.",
      },
      { onConflict: "test_date" },
    )
    .select("id")
    .single();

  if (testError || !testData) {
    console.error("Erreur création bilan:", testError?.message);
    process.exit(1);
  }

  const testId = testData.id;
  console.log(`Bilan créé/mis à jour: ${testId} (2026-09-02)`);

  // 2. Upsert des résultats
  const rows = results.map((r) => ({
    test_id: testId,
    ...r,
  }));

  const { error: resultsError } = await supabase
    .from("blood_test_results")
    .upsert(rows, { onConflict: "test_id,biomarker_key" });

  if (resultsError) {
    console.error("Erreur résultats:", resultsError.message);
    process.exit(1);
  }

  console.log(`${rows.length} résultats insérés.`);
}

main();
