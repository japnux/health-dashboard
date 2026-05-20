"use client";

import { useState, useRef } from "react";
import {
  BIOMARKERS_BY_KEY,
  getBiomarkerStatus,
} from "@/lib/biomarkers";

type Props = {
  onSaved?: () => void;
};

type ParsedResult = {
  biomarker_key: string;
  value: number;
  unit: string;
  ref_min: number | null;
  ref_max: number | null;
};

type ParsedData = {
  test_date: string | null;
  lab_name: string | null;
  biological_age: number | null;
  results: ParsedResult[];
};

export function BloodTestForm({ onSaved }: Props) {
  const [step, setStep] = useState<"upload" | "review" | "done">("upload");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setParsing(true);

    try {
      const formData = new FormData();
      formData.append("pdf", file);

      const res = await fetch("/api/blood-tests/parse-pdf", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as Record<string, string>).error ?? `Erreur ${res.status}`);
      }

      const data: ParsedData = await res.json();
      if (!data.results || data.results.length === 0) {
        throw new Error("Aucun biomarqueur trouvé dans le PDF");
      }

      setParsed(data);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de parsing");
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!parsed) return;
    setError(null);
    setSaving(true);

    try {
      // Enrichir avec label/category depuis le registre
      const enriched = parsed.results.map((r) => {
        const def = BIOMARKERS_BY_KEY.get(r.biomarker_key);
        return {
          ...r,
          ref_min: r.ref_min ?? def?.refMin ?? null,
          ref_max: r.ref_max ?? def?.refMax ?? null,
        };
      });

      const body = {
        test_date: parsed.test_date,
        lab_name: parsed.lab_name,
        biological_age: parsed.biological_age,
        results: enriched,
      };

      const res = await fetch("/api/blood-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as Record<string, string>).error ?? `Erreur ${res.status}`);
      }

      const data = await res.json();
      setSuccess(`Bilan importé : ${data.results_count} marqueurs`);
      setStep("done");
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setStep("upload");
    setParsed(null);
    setFileName(null);
    setError(null);
    setSuccess(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // Compter les statuts pour la preview
  const statusCounts = parsed?.results.reduce(
    (acc, r) => {
      const def = BIOMARKERS_BY_KEY.get(r.biomarker_key);
      const status = getBiomarkerStatus(r.value, r.ref_min ?? def?.refMin ?? null, r.ref_max ?? def?.refMax ?? null);
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  ) ?? {};

  return (
    <div className="space-y-4">
      {/* Messages */}
      {error && (
        <div className="text-sm text-[#ea2261] bg-[#ea2261]/5 rounded-[var(--radius-md)] p-3">
          {error}
        </div>
      )}
      {success && (
        <div className="text-sm text-[#15be53] bg-[#15be53]/5 rounded-[var(--radius-md)] p-3">
          {success}
        </div>
      )}

      {/* Étape 1 : Upload */}
      {step === "upload" && (
        <div className="space-y-3">
          <p className="text-[11px] text-[var(--color-body)]">
            Importe le PDF de ton bilan sanguin (Lucis, Cerba…). Les marqueurs seront extraits automatiquement.
          </p>

          <label
            className={`flex flex-col items-center justify-center gap-2 p-8 rounded-[var(--radius-lg)] border-2 border-dashed transition-colors cursor-pointer ${
              parsing
                ? "border-[var(--color-brand-purple)]/30 bg-[var(--color-brand-purple)]/5"
                : "border-[var(--color-border)]/50 dark:border-white/10 hover:border-[var(--color-brand-purple)]/40 hover:bg-[var(--color-brand-purple)]/3"
            }`}
          >
            {parsing ? (
              <>
                <span className="inline-block w-8 h-8 border-3 border-[var(--color-brand-purple)]/30 border-t-[var(--color-brand-purple)] rounded-full animate-spin" />
                <span className="text-sm text-[var(--color-body)]">
                  Analyse du PDF en cours…
                </span>
                {fileName && (
                  <span className="text-[10px] text-[var(--color-body)]/60">{fileName}</span>
                )}
              </>
            ) : (
              <>
                <span className="text-3xl">📄</span>
                <span className="text-sm text-[var(--color-heading)] dark:text-white">
                  Déposer un PDF ici
                </span>
                <span className="text-[11px] text-[var(--color-body)]">
                  ou cliquer pour sélectionner
                </span>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              disabled={parsing}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Étape 2 : Review */}
      {step === "review" && parsed && (
        <div className="space-y-4">
          {/* Résumé */}
          <div className="flex items-center gap-4 text-sm">
            <div className="text-[var(--color-heading)] dark:text-white">
              📅 {parsed.test_date ?? "Date inconnue"}
            </div>
            {parsed.lab_name && (
              <div className="text-[var(--color-body)]">🏥 {parsed.lab_name}</div>
            )}
            {parsed.biological_age != null && (
              <div className="text-[var(--color-brand-purple)]">
                🧬 Âge bio : {parsed.biological_age} ans
              </div>
            )}
          </div>

          {/* Badges */}
          <div className="flex gap-3 text-[11px]">
            <span className="px-2 py-1 rounded-full bg-[#15be53]/10 text-[#15be53]">
              {statusCounts.optimal ?? 0} optimal
            </span>
            <span className="px-2 py-1 rounded-full bg-[#64748d]/10 text-[#64748d]">
              {statusCounts.borderline ?? 0} normal
            </span>
            <span className="px-2 py-1 rounded-full bg-[#ea2261]/10 text-[#ea2261]">
              {statusCounts.out_of_range ?? 0} hors plage
            </span>
          </div>

          {/* Tableau de preview */}
          <div className="max-h-[400px] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white dark:bg-[var(--color-card)]">
                <tr className="border-b border-[var(--color-border)]/50 dark:border-white/5">
                  <th className="text-left text-[10px] uppercase tracking-wide text-[var(--color-body)] font-normal py-2 px-3">
                    Marqueur
                  </th>
                  <th className="text-right text-[10px] uppercase tracking-wide text-[var(--color-body)] font-normal py-2 px-3">
                    Valeur
                  </th>
                  <th className="text-right text-[10px] uppercase tracking-wide text-[var(--color-body)] font-normal py-2 px-3">
                    Réf
                  </th>
                  <th className="text-center text-[10px] uppercase tracking-wide text-[var(--color-body)] font-normal py-2 px-3 w-10">
                    &nbsp;
                  </th>
                </tr>
              </thead>
              <tbody>
                {parsed.results.map((r, i) => {
                  const def = BIOMARKERS_BY_KEY.get(r.biomarker_key);
                  const refMin = r.ref_min ?? def?.refMin ?? null;
                  const refMax = r.ref_max ?? def?.refMax ?? null;
                  const status = getBiomarkerStatus(r.value, refMin, refMax);
                  const label = def?.label ?? r.biomarker_key;

                  return (
                    <tr
                      key={i}
                      className="border-b border-[var(--color-border)]/20 dark:border-white/3"
                    >
                      <td className="py-1.5 px-3 text-[var(--color-heading)] dark:text-white text-[12px]">
                        {label}
                      </td>
                      <td
                        className={`py-1.5 px-3 text-right tabular-nums text-[12px] font-medium ${
                          status === "optimal"
                            ? "text-[var(--color-heading)] dark:text-white"
                            : status === "borderline"
                              ? "text-[#64748d]"
                              : "text-[#ea2261]"
                        }`}
                      >
                        {fmtVal(r.value, r.unit)} {r.unit}
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-[10px] text-[var(--color-body)]/60">
                        {refMin != null && refMax != null
                          ? `${refMin}–${refMax}`
                          : refMax != null
                            ? `< ${refMax}`
                            : refMin != null
                              ? `> ${refMin}`
                              : ""}
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            status === "optimal"
                              ? "bg-[#15be53]"
                              : status === "borderline"
                                ? "bg-[#64748d]"
                                : "bg-[#ea2261]"
                          }`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 text-sm px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] dark:border-white/10 text-[var(--color-body)] hover:text-[var(--color-heading)] transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 text-sm font-normal px-4 py-2.5 rounded-[var(--radius-md)] bg-[var(--color-brand-purple)] text-white hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {saving ? "Import en cours…" : `Importer ${parsed.results.length} marqueurs`}
            </button>
          </div>
        </div>
      )}

      {/* Étape 3 : Terminé */}
      {step === "done" && (
        <div className="text-center py-4">
          <button
            onClick={reset}
            className="text-sm text-[var(--color-brand-purple)] hover:underline"
          >
            Importer un autre bilan
          </button>
        </div>
      )}
    </div>
  );
}

function fmtVal(value: number, unit: string): string {
  if (unit === "calc" || unit === "%" || unit === "g/L") return value.toFixed(2);
  if (Math.abs(value) < 10) return value.toFixed(1);
  return Math.round(value).toString();
}
