"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BloodTestForm } from "@/components/BloodTestForm";
import { getBiomarkerStatus, BIOMARKER_CATEGORIES, BIOMARKERS_BY_KEY, type BiomarkerCategory } from "@/lib/biomarkers";
import type { AttentionMarker } from "./page";

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

type TestWithMeta = {
  id: string;
  test_date: string;
  lab_name: string | null;
  notes: string | null;
  biological_age: number | null;
  blood_test_results: BloodTestResult[];
  resultsByCategory: Record<string, BloodTestResult[]>;
  outOfRangeCount: number;
  totalMarkers: number;
};

type Props = {
  tests: TestWithMeta[];
  categories: { key: BiomarkerCategory; label: string; icon: string }[];
  attentionMarkers: AttentionMarker[];
};

// ── Mini Sparkline SVG ────────────────────────────────────────────

function MiniSparkline({
  data,
  refMin,
  refMax,
  width = 80,
  height = 28,
}: {
  data: number[];
  refMin: number | null;
  refMax: number | null;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;

  const pad = 3;
  const dotR = 2.5;
  const allVals = [...data];
  if (refMin != null) allVals.push(refMin);
  if (refMax != null) allVals.push(refMax);
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;

  const scaleX = (i: number) => pad + (i / (data.length - 1)) * (width - 2 * pad);
  const scaleY = (v: number) => height - pad - ((v - min) / range) * (height - 2 * pad);

  const points = data.map((v, i) => `${scaleX(i).toFixed(1)},${scaleY(v).toFixed(1)}`).join(" ");

  const lastVal = data[data.length - 1];
  const inRange =
    (refMin == null || lastVal >= refMin) && (refMax == null || lastVal <= refMax);
  const lineColor = inRange ? "#06b6d4" : "#ea2261";

  return (
    <svg width={width} height={height} className="inline-block shrink-0">
      {refMin != null && refMax != null && (
        <rect
          x={0}
          y={scaleY(refMax)}
          width={width}
          height={Math.max(0, scaleY(refMin) - scaleY(refMax))}
          fill="#15be53"
          opacity={0.08}
          rx={2}
        />
      )}
      {refMax != null && refMin == null && (
        <rect
          x={0}
          y={scaleY(refMax)}
          width={width}
          height={Math.max(0, height - pad - scaleY(refMax))}
          fill="#15be53"
          opacity={0.08}
          rx={2}
        />
      )}
      {refMin != null && refMax == null && (
        <rect
          x={0}
          y={pad}
          width={width}
          height={Math.max(0, scaleY(refMin) - pad)}
          fill="#15be53"
          opacity={0.08}
          rx={2}
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {data.map((v, i) => (
        <circle
          key={i}
          cx={scaleX(i)}
          cy={scaleY(v)}
          r={i === data.length - 1 ? dotR : 1.5}
          fill={lineColor}
          opacity={i === data.length - 1 ? 1 : 0.4}
        />
      ))}
    </svg>
  );
}

// ── Delta helpers ─────────────────────────────────────────────────

function getDeltaColor(delta: number, biomarkerKey: string): string {
  if (delta === 0) return "text-[var(--color-body)]/40";
  const def = BIOMARKERS_BY_KEY.get(biomarkerKey);
  const isGood = def?.lowerIsBetter ? delta < 0 : delta > 0;
  return isGood ? "text-[#15be53]" : "text-[#ea2261]";
}

/** Utilise les plages optimales du registre plutôt que celles stockées en DB (issues du PDF labo) */
function getEffectiveRefs(biomarkerKey: string, dbRefMin: number | null, dbRefMax: number | null) {
  const def = BIOMARKERS_BY_KEY.get(biomarkerKey);
  if (def) return { refMin: def.refMin, refMax: def.refMax };
  return { refMin: dbRefMin, refMax: dbRefMax };
}

// ── Ligne de marqueur unifiée (colonnes fixes) ──────────────────

function BiomarkerRow({
  biomarkerKey, label, value, unit, status, effMin, effMax, delta, history, router,
}: {
  biomarkerKey: string;
  label: string;
  value: number;
  unit: string;
  status: string;
  effMin: number | null;
  effMax: number | null;
  delta: number | null;
  history: number[];
  router: ReturnType<typeof useRouter>;
}) {
  const dotClass =
    status === "optimal" ? "bg-[#15be53]" : status === "borderline" ? "bg-[#f59e0b]" : "bg-[#ea2261]";
  const valClass =
    status === "optimal" ? "text-[#15be53]" : status === "borderline" ? "text-[#f59e0b]" : "text-[#ea2261]";

  return (
    <button
      onClick={() => router.push(`/biologie/marqueur/${biomarkerKey}`)}
      className="w-full flex items-center gap-1.5 py-2 px-2 rounded-[var(--radius-sm)] hover:bg-[var(--color-border)]/10 transition-colors text-left"
    >
      {/* Dot */}
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />

      {/* Nom — prend tout l'espace restant */}
      <span className="text-[13px] text-[var(--color-heading)] dark:text-white flex-1 min-w-0 truncate">
        {label}
      </span>

      {/* Sparkline — desktop only, largeur fixe */}
      <span className="hidden sm:inline-flex w-[64px] shrink-0 justify-center">
        {history.length >= 2 ? (
          <MiniSparkline data={history} refMin={effMin} refMax={effMax} width={64} height={24} />
        ) : null}
      </span>

      {/* Valeur — largeur fixe */}
      <span className={`text-[13px] font-medium tabular-nums w-[42px] text-right shrink-0 ${valClass}`}>
        {fmtBioVal(value, unit)}
      </span>

      {/* Unité — largeur fixe */}
      <span className="text-[10px] text-[var(--color-body)]/50 w-[30px] shrink-0 truncate">
        {unit}
      </span>

      {/* Delta — largeur fixe, toujours rendu (vide si pas de delta) */}
      <span
        className={`text-[10px] tabular-nums w-[36px] text-right shrink-0 ${
          delta != null && delta !== 0 ? getDeltaColor(delta, biomarkerKey) : ""
        }`}
      >
        {delta != null && delta !== 0
          ? `${delta > 0 ? "+" : ""}${fmtBioVal(delta, unit)}`
          : ""}
      </span>

      {/* Plage optimale — desktop only */}
      <span className="hidden sm:inline-block text-[10px] text-[var(--color-body)]/40 tabular-nums w-[52px] text-right shrink-0">
        {effMin != null && effMax != null
          ? `${effMin}–${effMax}`
          : effMax != null
            ? `< ${effMax}`
            : effMin != null
              ? `> ${effMin}`
              : ""}
      </span>
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════
// AXE 1 — Résumé d'attention
// ══════════════════════════════════════════════════════════════════

function AttentionSummary({ markers, testDate }: { markers: AttentionMarker[]; testDate: string }) {
  const router = useRouter();
  if (markers.length === 0) {
    return (
      <div
        className="rounded-[var(--radius-lg)] bg-[#15be53]/5 border border-[#15be53]/20 p-4 flex items-center gap-3"
      >
        <span className="text-xl">✅</span>
        <div>
          <p className="text-sm font-medium text-[var(--color-heading)] dark:text-white">
            Tous les marqueurs sont dans la plage optimale
          </p>
          <p className="text-xs text-[var(--color-body)] mt-0.5">
            Bilan du {new Date(testDate + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>
    );
  }

  const critical = markers.filter((m) => m.status === "out_of_range");
  const degrading = markers.filter((m) => m.trend === "degrading");
  const top3 = markers.slice(0, 3);

  return (
    <div
      className="rounded-[var(--radius-lg)] border p-4 space-y-3"
      style={{
        backgroundColor: critical.length > 0 ? "rgba(234,34,97,0.04)" : "rgba(245,158,11,0.04)",
        borderColor: critical.length > 0 ? "rgba(234,34,97,0.2)" : "rgba(245,158,11,0.2)",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{critical.length > 0 ? "⚠️" : "👀"}</span>
          <div>
            <p className="text-sm font-medium text-[var(--color-heading)] dark:text-white">
              {markers.length} marqueur{markers.length > 1 ? "s" : ""} à surveiller
            </p>
            <p className="text-xs text-[var(--color-body)] mt-0.5">
              {critical.length > 0 && (
                <span className="text-[#ea2261] font-medium">{critical.length} hors plage</span>
              )}
              {critical.length > 0 && degrading.length > 0 && " · "}
              {degrading.length > 0 && (
                <span className="text-[#f59e0b] font-medium">{degrading.length} en dégradation</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Top marqueurs */}
      <div className="flex flex-wrap gap-2">
        {top3.map((m) => (
          <button
            key={m.biomarkerKey}
            onClick={() => router.push(`/biologie/marqueur/${m.biomarkerKey}`)}
            className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] bg-white dark:bg-white/5 border border-[var(--color-border)]/30 dark:border-white/10 hover:border-[var(--color-brand-purple)]/40 transition-colors text-left"
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                m.status === "out_of_range" ? "bg-[#ea2261]" : "bg-[#f59e0b]"
              }`}
            />
            <div>
              <p className="text-[12px] font-medium text-[var(--color-heading)] dark:text-white leading-tight">
                {m.label}
              </p>
              <p className="text-[10px] text-[var(--color-body)] mt-0.5 tabular-nums">
                {fmtBioVal(m.value, m.unit)} {m.unit}
                {m.trend === "degrading" && <span className="text-[#ea2261] ml-1">↗ dégradation</span>}
                {m.trend === "improving" && <span className="text-[#15be53] ml-1">↘ amélioration</span>}
              </p>
            </div>
          </button>
        ))}
        {markers.length > 3 && (
          <span className="self-center text-xs text-[var(--color-body)]/60 px-2">
            +{markers.length - 3} autre{markers.length - 3 > 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// AXE 2 — Patterns inter-marqueurs (IA)
// ══════════════════════════════════════════════════════════════════

type BloodPattern = {
  id: string;
  title: string;
  severity: "critical" | "warning" | "info";
  markers: string[];
  markerDetails: string;
  description: string;
  actions: string[];
  icon: string;
};

function BloodPatternsSection() {
  const router = useRouter();
  const [patterns, setPatterns] = useState<BloodPattern[]>([]);
  const [globalNote, setGlobalNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [hasCached, setHasCached] = useState(false);

  // Auto-fetch depuis cache au mount
  useEffect(() => {
    fetch("/api/ai-analysis?type=blood_patterns_latest")
      .then((r) => r.json())
      .then((data) => {
        if (data.cached && data.patterns?.length > 0) {
          setPatterns(data.patterns);
          setGlobalNote(data.globalNote ?? null);
          setHasCached(true);
        }
        setFetched(true);
      })
      .catch(() => setFetched(true));
  }, []);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "blood_patterns" }),
      });
      const data = await res.json();
      if (data.patterns) {
        setPatterns(data.patterns);
        setGlobalNote(data.globalNote ?? null);
        setHasCached(true);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  if (!fetched) return null;

  const severityOrder = { critical: 0, warning: 1, info: 2 };
  const sortedPatterns = [...patterns].sort(
    (a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2),
  );

  const severityStyle = {
    critical: { bg: "bg-[#ea2261]/5", border: "border-[#ea2261]/20", text: "text-[#ea2261]" },
    warning: { bg: "bg-[#f59e0b]/5", border: "border-[#f59e0b]/20", text: "text-[#f59e0b]" },
    info: { bg: "bg-[#06b6d4]/5", border: "border-[#06b6d4]/20", text: "text-[#06b6d4]" },
  };

  return (
    <section
      className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-4 sm:p-5 space-y-4"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <div className="flex items-start sm:items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xs uppercase tracking-wide text-[var(--color-body)] font-normal">
            🔗 Synthèses inter-marqueurs
          </h2>
          <p className="text-[11px] text-[var(--color-body)]/60 mt-0.5">
            Patterns cliniques entre vos marqueurs
          </p>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="text-[11px] px-3 py-1.5 rounded-lg bg-[var(--color-brand-purple)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
        >
          {loading ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Analyse…
            </span>
          ) : hasCached ? (
            "↻ Relancer"
          ) : (
            "Analyser"
          )}
        </button>
      </div>

      {sortedPatterns.length > 0 ? (
        <div className="space-y-3">
          {sortedPatterns.map((p) => {
            const style = severityStyle[p.severity] ?? severityStyle.info;
            return (
              <div
                key={p.id}
                className={`rounded-xl ${style.bg} border ${style.border} p-4 space-y-2`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-lg shrink-0">{p.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-medium text-[var(--color-heading)] dark:text-white">
                        {p.title}
                      </p>
                      <span className={`text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded ${style.text} ${style.bg}`}>
                        {p.severity === "critical" ? "critique" : p.severity === "warning" ? "attention" : "info"}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--color-body)]/60 mt-0.5 tabular-nums">
                      {p.markerDetails}
                    </p>
                  </div>
                </div>

                <p className="text-[12px] text-[var(--color-body)] leading-relaxed">
                  {p.description}
                </p>

                {/* Marqueurs liés — cliquables */}
                <div className="flex flex-wrap gap-1.5">
                  {p.markers.map((mk) => {
                    const def = BIOMARKERS_BY_KEY.get(mk);
                    return (
                      <button
                        key={mk}
                        onClick={() => router.push(`/biologie/marqueur/${mk}`)}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-white/80 dark:bg-white/5 border border-[var(--color-border)]/30 dark:border-white/10 text-[var(--color-brand-purple)] hover:bg-[var(--color-brand-purple)]/5 transition-colors"
                      >
                        {def?.label ?? mk}
                      </button>
                    );
                  })}
                </div>

                {/* Actions */}
                {p.actions.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {p.actions.map((a, i) => (
                      <p key={i} className="text-[11px] text-[var(--color-heading)] dark:text-white/80 leading-relaxed pl-1">
                        → {a}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {globalNote && (
            <p className="text-[11px] text-[var(--color-body)]/60 italic px-1">{globalNote}</p>
          )}
        </div>
      ) : hasCached ? (
        <p className="text-sm text-[var(--color-body)]/60 text-center py-4">
          ✅ Aucun pattern clinique détecté — vos marqueurs sont cohérents.
        </p>
      ) : (
        <p className="text-[12px] text-[var(--color-body)]/50 text-center py-2">
          Lancez l&apos;analyse pour détecter des corrélations entre marqueurs.
        </p>
      )}
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════
// AXE 3 — Âge biologique transparent
// ══════════════════════════════════════════════════════════════════

function BioAgeExplainer({ bioAge, userAge }: { bioAge: number; userAge: number | null }) {
  const [open, setOpen] = useState(false);
  const diff = userAge ? Math.round((bioAge - userAge) * 10) / 10 : null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-[11px] px-2.5 py-1 rounded-full bg-[var(--color-brand-purple)]/10 text-[var(--color-brand-purple)] hover:bg-[var(--color-brand-purple)]/15 transition-colors flex items-center gap-1"
      >
        Âge bio : {Math.round(bioAge * 10) / 10} ans
        {diff !== null && (
          <span className={diff < 0 ? "text-[#15be53]" : diff > 0 ? "text-[#ea2261]" : ""}>
            ({diff > 0 ? "+" : ""}{diff})
          </span>
        )}
        <span className="text-[9px] opacity-60 ml-0.5">{open ? "▲" : "ℹ"}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 w-72 z-20 rounded-xl bg-white dark:bg-[#1a1a2e] border border-[var(--color-border)] dark:border-white/10 p-4 space-y-2 shadow-lg">
          <p className="text-[12px] font-medium text-[var(--color-heading)] dark:text-white">
            Comment est calculé l&apos;âge biologique ?
          </p>
          <p className="text-[11px] text-[var(--color-body)] leading-relaxed">
            L&apos;âge biologique est estimé par le laboratoire à partir de marqueurs clés corrélés au vieillissement : HbA1c (glycation), hsCRP (inflammation), lipides (ApoB, HDL), hormones (DHEA, testostérone), vitamines (D, B12), fonction rénale (DFG).
          </p>
          <div className="space-y-1 pt-1">
            <p className="text-[10px] uppercase tracking-wide text-[var(--color-body)]/50 font-medium">
              Marqueurs contributeurs
            </p>
            <div className="flex flex-wrap gap-1">
              {["HbA1c", "hsCRP", "ApoB", "HDL", "DHEA", "Vit D", "DFG", "Homocystéine"].map((m) => (
                <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-border)]/20 dark:bg-white/5 text-[var(--color-body)]">
                  {m}
                </span>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-[var(--color-body)]/40 pt-1">
            {diff !== null && diff < 0
              ? `Votre âge bio est ${Math.abs(diff)} an${Math.abs(diff) > 1 ? "s" : ""} inférieur à votre âge réel — bon signe.`
              : diff !== null && diff > 0
                ? `Votre âge bio est ${diff} an${diff > 1 ? "s" : ""} supérieur — des optimisations sont possibles.`
                : "Comparez avec votre âge réel dans les paramètres."}
          </p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// AXE 4 — Analyse IA proactive par catégorie
// ══════════════════════════════════════════════════════════════════

type BloodCatAnalysis = {
  summary: string;
  insights: string[];
  recommendations: string[];
  alert: string | null;
  generatedAt?: string;
};

function BloodCategoryAiCard({ category }: { category: string }) {
  const [analysis, setAnalysis] = useState<BloodCatAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Auto-fetch cache au mount
  useEffect(() => {
    setFetched(false);
    setAnalysis(null);
    setError(null);
    setExpanded(false);
    fetch(`/api/ai-analysis?type=blood_cat_${category}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.cached && data.summary) {
          setAnalysis({
            summary: data.summary,
            insights: data.insights ?? [],
            recommendations: data.recommendations ?? [],
            alert: data.alert ?? null,
            generatedAt: data.generatedAt,
          });
        }
        setFetched(true);
      })
      .catch(() => setFetched(true));
  }, [category]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "blood_category", category }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setAnalysis({
          summary: data.summary,
          insights: data.insights ?? [],
          recommendations: data.recommendations ?? [],
          alert: data.alert ?? null,
          generatedAt: new Date().toISOString(),
        });
        setExpanded(true);
      }
    } catch {
      setError("Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  if (!fetched) return null;

  // Mode proactif : preview quand on a du cache
  if (analysis && !expanded) {
    const attentionCount =
      (analysis.alert ? 1 : 0) + analysis.insights.filter((i) => i.includes("⚠") || i.includes("🚨") || i.includes("↗") || i.includes("hors")).length;

    return (
      <div className="rounded-xl overflow-hidden border border-[var(--color-border)]/30 dark:border-white/5">
        <button
          onClick={() => setExpanded(true)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[var(--color-border)]/5 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base shrink-0">🤖</span>
            <div className="min-w-0">
              {analysis.alert ? (
                <p className="text-[12px] text-[#ea2261] font-medium truncate">
                  🚨 {analysis.alert.slice(0, 80)}{analysis.alert.length > 80 ? "…" : ""}
                </p>
              ) : attentionCount > 0 ? (
                <p className="text-[12px] text-[#f59e0b] font-medium">
                  {attentionCount} point{attentionCount > 1 ? "s" : ""} d&apos;attention détecté{attentionCount > 1 ? "s" : ""}
                </p>
              ) : (
                <p className="text-[12px] text-[var(--color-body)] truncate">
                  {analysis.summary.slice(0, 80)}{analysis.summary.length > 80 ? "…" : ""}
                </p>
              )}
            </div>
          </div>
          <span className="text-[11px] text-[var(--color-brand-purple)] shrink-0 ml-2">
            Voir l&apos;analyse →
          </span>
        </button>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="p-4 rounded-xl bg-[var(--color-border)]/10 dark:bg-white/3 border border-dashed border-[var(--color-border)]/40 dark:border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-[var(--color-body)]">
            <span className="text-base">🤖</span>
            <span>Analyse IA disponible</span>
          </div>
          <button
            onClick={generate}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-brand-purple)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyse…
              </span>
            ) : (
              "Générer l'analyse"
            )}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-[#ea2261]">{error}</p>}
      </div>
    );
  }

  // Mode expanded : analyse complète
  return (
    <div className="rounded-xl overflow-hidden border border-[var(--color-border)]/30 dark:border-white/5">
      <div className="px-4 py-3 bg-[var(--color-brand-purple)]/8 dark:bg-[var(--color-brand-purple)]/15 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🤖</span>
          <span className="text-sm font-medium text-[var(--color-heading)] dark:text-white">Analyse IA</span>
          {analysis.generatedAt && (
            <span className="text-[10px] text-[var(--color-body)]/60">
              {new Date(analysis.generatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(false)}
            className="text-[10px] px-2 py-1 rounded-md bg-[var(--color-border)]/20 dark:bg-white/5 text-[var(--color-body)] hover:text-[var(--color-heading)] transition-colors"
          >
            Réduire
          </button>
          <button
            onClick={generate}
            disabled={loading}
            className="text-[10px] px-2 py-1 rounded-md bg-[var(--color-border)]/20 dark:bg-white/5 text-[var(--color-body)] hover:text-[var(--color-heading)] transition-colors disabled:opacity-50"
          >
            {loading ? "Analyse…" : "↻ Relancer"}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {analysis.alert && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-[#ea2261]/10 text-[#ea2261] text-[13px]">
            <span className="shrink-0 mt-0.5">🚨</span>
            <span>{analysis.alert}</span>
          </div>
        )}

        <p className="text-[13px] text-[var(--color-heading)] dark:text-white leading-relaxed">
          {analysis.summary}
        </p>

        {analysis.insights.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide text-[var(--color-body)]/60 font-medium">Observations</p>
            {analysis.insights.map((insight, i) => (
              <p key={i} className="text-[12px] text-[var(--color-body)] leading-relaxed pl-1">
                {insight}
              </p>
            ))}
          </div>
        )}

        {analysis.recommendations.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide text-[var(--color-body)]/60 font-medium">Recommandations</p>
            {analysis.recommendations.map((reco, i) => (
              <p key={i} className="text-[12px] text-[var(--color-body)] leading-relaxed pl-1">
                {reco}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Composant principal
// ══════════════════════════════════════════════════════════════════

export function BiologieClient({ tests, categories, attentionMarkers }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [expandedTest, setExpandedTest] = useState<string | null>(
    tests[0]?.id ?? null,
  );
  const [activeCategory, setActiveCategory] = useState<string>(
    BIOMARKER_CATEGORIES[0].key,
  );

  function handleSaved() {
    setShowForm(false);
    router.refresh();
  }

  const fmtDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  const allCategories = new Set(
    tests.flatMap((t) => t.blood_test_results.map((r) => r.category)),
  );
  const visibleCategories = BIOMARKER_CATEGORIES.filter((c) =>
    allCategories.has(c.key),
  );

  const latest = tests[0] ?? null;
  const previous = tests.length >= 2 ? tests[1] : null;

  // Récupérer userAge depuis le config (on le passe pas encore, null par défaut)
  const userAge: number | null = null;

  const biomarkerHistory = useMemo(() => {
    const map = new Map<string, number[]>();
    const chronological = [...tests].reverse();
    for (const test of chronological) {
      for (const r of test.blood_test_results) {
        if (!map.has(r.biomarker_key)) map.set(r.biomarker_key, []);
        map.get(r.biomarker_key)!.push(r.value);
      }
    }
    return map;
  }, [tests]);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-normal text-[var(--color-heading)] dark:text-white">
            🧬 Biologie
          </h1>
          <p className="text-sm text-[var(--color-body)] mt-0.5">
            {tests.length === 0
              ? "Aucun bilan enregistré"
              : `${tests.length} bilan${tests.length > 1 ? "s" : ""} enregistré${tests.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm px-4 py-2 rounded-[var(--radius-md)] bg-[var(--color-brand-purple)] text-white hover:opacity-90 transition-opacity"
        >
          {showForm ? "Fermer" : "+ Nouveau bilan"}
        </button>
      </div>

      {/* Formulaire */}
      {showForm && (
        <section
          className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5"
          style={{ boxShadow: "var(--shadow-ambient)" }}
        >
          <h2 className="text-xs uppercase tracking-wide text-[var(--color-body)] mb-4 font-normal">
            Importer un bilan (PDF)
          </h2>
          <BloodTestForm onSaved={handleSaved} />
        </section>
      )}

      {/* ═══ AXE 1 — Résumé d'attention ═══ */}
      {latest && (
        <AttentionSummary markers={attentionMarkers} testDate={latest.test_date} />
      )}

      {/* ═══ AXE 2 — Patterns inter-marqueurs ═══ */}
      {tests.length > 0 && <BloodPatternsSection />}

      {/* Analyse par catégorie */}
      {tests.length > 0 && (
        <section
          className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-4 sm:p-5 space-y-4"
          style={{ boxShadow: "var(--shadow-ambient)" }}
        >
          <h2 className="text-xs uppercase tracking-wide text-[var(--color-body)] font-normal">
            Analyse par catégorie
          </h2>

          {/* Sélecteur de catégorie — scroll horizontal mobile */}
          <div className="-mx-4 sm:-mx-5 px-4 sm:px-5 overflow-x-auto scrollbar-none">
            <div className="flex gap-1.5 w-max">
              {visibleCategories.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={`text-[11px] px-2.5 py-1.5 rounded-full transition-colors whitespace-nowrap ${
                    activeCategory === cat.key
                      ? "bg-[var(--color-brand-purple)] text-white"
                      : "bg-[var(--color-border)]/30 dark:bg-white/5 text-[var(--color-body)] hover:text-[var(--color-heading)]"
                  }`}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Liste de marqueurs — layout mobile-first (cards) */}
          <div className="space-y-1">
            {latest?.blood_test_results
              .filter((r) => r.category === activeCategory)
              .map((r) => {
                const { refMin: effMin, refMax: effMax } = getEffectiveRefs(r.biomarker_key, r.ref_min, r.ref_max);
                const status = getBiomarkerStatus(r.value, effMin, effMax);
                const prevResult = previous?.blood_test_results.find(
                  (pr) => pr.biomarker_key === r.biomarker_key,
                );
                const delta = prevResult ? r.value - prevResult.value : null;
                const history = biomarkerHistory.get(r.biomarker_key) ?? [];

                return (
                  <BiomarkerRow
                    key={r.biomarker_key}
                    biomarkerKey={r.biomarker_key}
                    label={r.label}
                    value={r.value}
                    unit={r.unit}
                    status={status}
                    effMin={effMin}
                    effMax={effMax}
                    delta={delta}
                    history={history}
                    router={router}
                  />
                );
              })}
          </div>

          {/* ═══ AXE 4 — Analyse IA proactive par catégorie ═══ */}
          <BloodCategoryAiCard category={activeCategory} />
        </section>
      )}

      {/* Liste des bilans */}
      {tests.length > 0 && (
        <h2 className="text-xs uppercase tracking-wide text-[var(--color-body)] font-normal">
          Historique des bilans
        </h2>
      )}
      {tests.map((test) => {
        const isExpanded = expandedTest === test.id;

        return (
          <section
            key={test.id}
            className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 overflow-hidden"
            style={{ boxShadow: "var(--shadow-ambient)" }}
          >
            <button
              onClick={() => setExpandedTest(isExpanded ? null : test.id)}
              className="w-full px-4 sm:px-5 py-3 sm:py-4 flex items-center justify-between text-left hover:bg-[var(--color-border)]/5 transition-colors gap-2"
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 min-w-0">
                <div className="min-w-0">
                  <p className="text-sm font-normal text-[var(--color-heading)] dark:text-white truncate">
                    {fmtDate(test.test_date)}
                  </p>
                  <p className="text-[11px] text-[var(--color-body)] mt-0.5">
                    {test.lab_name ?? "Labo inconnu"} · {test.totalMarkers} marqueurs
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* ═══ AXE 3 — Âge bio transparent ═══ */}
                  {test.biological_age != null && (
                    <BioAgeExplainer bioAge={test.biological_age} userAge={userAge} />
                  )}
                  {test.outOfRangeCount > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#ea2261]/10 text-[#ea2261] whitespace-nowrap">
                      {test.outOfRangeCount} hors plage
                    </span>
                  )}
                </div>
              </div>
              <span className="text-[var(--color-body)] text-xs shrink-0">
                {isExpanded ? "▲" : "▼"}
              </span>
            </button>

            {isExpanded && (
              <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-4 border-t border-[var(--color-border)]/50 dark:border-white/5">
                {categories.map((cat) => {
                  const results = test.resultsByCategory[cat.key];
                  if (!results || results.length === 0) return null;

                  const prevTest = tests.find(
                    (t) => t.test_date < test.test_date,
                  );

                  return (
                    <div key={cat.key} className="pt-3">
                      <p className="text-[11px] uppercase tracking-wide text-[var(--color-body)] mb-2 flex items-center gap-1.5">
                        <span>{cat.icon}</span>
                        {cat.label}
                      </p>
                      <div className="space-y-0.5">
                        {results.map((r) => {
                          const { refMin: effMin, refMax: effMax } = getEffectiveRefs(r.biomarker_key, r.ref_min, r.ref_max);
                          const status = getBiomarkerStatus(
                            r.value,
                            effMin,
                            effMax,
                          );
                          const prevResult = prevTest?.blood_test_results.find(
                            (pr) => pr.biomarker_key === r.biomarker_key,
                          );
                          const delta = prevResult
                            ? r.value - prevResult.value
                            : null;
                          const history = biomarkerHistory.get(r.biomarker_key) ?? [];

                          return (
                            <BiomarkerRow
                              key={r.id}
                              biomarkerKey={r.biomarker_key}
                              label={r.label}
                              value={r.value}
                              unit={r.unit}
                              status={status}
                              effMin={effMin}
                              effMax={effMax}
                              delta={delta}
                              history={history}
                              router={router}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

function formatValue(value: number, unit: string): string {
  if (unit === "calc" || unit === "%" || unit === "g/L") return value.toFixed(2);
  if (Math.abs(value) < 10) return value.toFixed(1);
  return Math.round(value).toString();
}

function fmtBioVal(value: number, unit: string): string {
  if (unit === "calc" || unit === "%" || unit === "g/L") return value.toFixed(2);
  if (Math.abs(value) < 10) return value.toFixed(1);
  return Math.round(value).toString();
}
