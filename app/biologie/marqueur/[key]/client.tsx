"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { getBiomarkerStatus } from "@/lib/biomarkers";

type HistoryPoint = {
  date: string;
  lab: string | null;
  value: number;
  unit: string;
  ref_min: number | null;
  ref_max: number | null;
};

type Props = {
  biomarkerKey: string;
  label: string;
  category: string;
  unit: string;
  refMin: number | null;
  refMax: number | null;
  lowerIsBetter: boolean;
  description: string | null;
  history: HistoryPoint[];
};

type AiAnalysis = {
  description: string;
  recommendations: string[];
} | null;

// ── Graphe d'évolution ──────────────────────────────────────────────

function EvolutionChart({
  history,
  refMin,
  refMax,
}: {
  history: HistoryPoint[];
  refMin: number | null;
  refMax: number | null;
}) {
  if (history.length === 0) return null;

  const W = 560;
  const H = 220;
  const padL = 50;
  const padR = 20;
  const padT = 20;
  const padB = 40;

  const values = history.map((h) => h.value);
  const allVals = [...values];
  if (refMin != null) allVals.push(refMin);
  if (refMax != null) allVals.push(refMax);
  const dataMin = Math.min(...allVals);
  const dataMax = Math.max(...allVals);
  const margin = (dataMax - dataMin) * 0.15 || 1;
  const yMin = dataMin - margin;
  const yMax = dataMax + margin;

  const scaleX = (i: number) =>
    padL + (history.length === 1 ? (W - padL - padR) / 2 : (i / (history.length - 1)) * (W - padL - padR));
  const scaleY = (v: number) =>
    padT + ((yMax - v) / (yMax - yMin)) * (H - padT - padB);

  const points = history.map((h, i) => `${scaleX(i).toFixed(1)},${scaleY(h.value).toFixed(1)}`).join(" ");

  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks }, (_, i) => yMin + (i / (yTicks - 1)) * (yMax - yMin));

  const fmtDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      {/* Grille horizontale */}
      {yTickValues.map((v, i) => (
        <g key={i}>
          <line
            x1={padL}
            y1={scaleY(v)}
            x2={W - padR}
            y2={scaleY(v)}
            stroke="currentColor"
            className="text-[var(--color-border)]/30 dark:text-white/5"
            strokeWidth={0.5}
          />
          <text
            x={padL - 6}
            y={scaleY(v) + 3}
            textAnchor="end"
            className="fill-[var(--color-body)]/50 text-[9px]"
          >
            {v < 10 ? v.toFixed(1) : Math.round(v)}
          </text>
        </g>
      ))}

      {/* Bande de référence */}
      {refMin != null && refMax != null && (
        <rect
          x={padL}
          y={scaleY(refMax)}
          width={W - padL - padR}
          height={Math.max(0, scaleY(refMin) - scaleY(refMax))}
          fill="#15be53"
          opacity={0.08}
          rx={3}
        />
      )}
      {refMax != null && refMin == null && (
        <rect
          x={padL}
          y={scaleY(refMax)}
          width={W - padL - padR}
          height={Math.max(0, H - padB - scaleY(refMax))}
          fill="#15be53"
          opacity={0.08}
          rx={3}
        />
      )}
      {refMin != null && refMax == null && (
        <rect
          x={padL}
          y={padT}
          width={W - padL - padR}
          height={Math.max(0, scaleY(refMin) - padT)}
          fill="#15be53"
          opacity={0.08}
          rx={3}
        />
      )}

      {/* Lignes de référence */}
      {refMin != null && (
        <line
          x1={padL}
          y1={scaleY(refMin)}
          x2={W - padR}
          y2={scaleY(refMin)}
          stroke="#15be53"
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.5}
        />
      )}
      {refMax != null && (
        <line
          x1={padL}
          y1={scaleY(refMax)}
          x2={W - padR}
          y2={scaleY(refMax)}
          stroke="#15be53"
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.5}
        />
      )}

      {/* Labels ref */}
      {refMin != null && (
        <text x={W - padR + 3} y={scaleY(refMin) + 3} className="fill-[#15be53] text-[8px]" opacity={0.7}>
          {refMin}
        </text>
      )}
      {refMax != null && (
        <text x={W - padR + 3} y={scaleY(refMax) + 3} className="fill-[#15be53] text-[8px]" opacity={0.7}>
          {refMax}
        </text>
      )}

      {/* Ligne */}
      <polyline
        points={points}
        fill="none"
        stroke="#06b6d4"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Points + labels */}
      {history.map((h, i) => {
        const status = getBiomarkerStatus(h.value, refMin, refMax);
        const color = status === "optimal" ? "#06b6d4" : status === "borderline" ? "#64748d" : "#ea2261";
        return (
          <g key={i}>
            <circle cx={scaleX(i)} cy={scaleY(h.value)} r={4} fill={color} />
            <circle cx={scaleX(i)} cy={scaleY(h.value)} r={6} fill={color} opacity={0.15} />
            <text
              x={scaleX(i)}
              y={scaleY(h.value) - 10}
              textAnchor="middle"
              className="text-[9px] font-medium"
              fill={color}
            >
              {h.value < 10 ? h.value.toFixed(2) : h.value < 100 ? h.value.toFixed(1) : Math.round(h.value)}
            </text>
            {/* Date en bas */}
            <text
              x={scaleX(i)}
              y={H - padB + 16}
              textAnchor="middle"
              className="fill-[var(--color-body)]/50 text-[8px]"
            >
              {fmtDate(h.date)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Composant principal ─────────────────────────────────────────────

export function MarqueurClient({
  biomarkerKey,
  label,
  category,
  unit,
  refMin,
  refMax,
  lowerIsBetter,
  description,
  history,
}: Props) {
  const router = useRouter();
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiFetched, setAiFetched] = useState(false);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [questionLoading, setQuestionLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const latest = history[history.length - 1] ?? null;
  const latestStatus = latest ? getBiomarkerStatus(latest.value, refMin, refMax) : "optimal";
  const isOptimal = latestStatus === "optimal";

  const generateAnalysis = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "biomarker_detail", biomarkerKey }),
      });
      const data = await res.json();
      if (data.error) {
        setAiError(data.error);
      } else {
        setAiAnalysis({
          description: data.description ?? "",
          recommendations: data.recommendations ?? [],
        });
      }
    } catch {
      setAiError("Erreur de connexion");
    } finally {
      setAiLoading(false);
      setAiFetched(true);
    }
  };

  const askQuestion = async () => {
    if (!question.trim()) return;
    setQuestionLoading(true);
    setAnswer(null);
    try {
      const res = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "question",
          question: `À propos du marqueur ${label} (${biomarkerKey}) — catégorie ${category}. Mes valeurs historiques : ${history.map((h) => `${h.date}: ${h.value} ${h.unit}`).join(", ")}. Plage optimale : ${refMin ?? "—"}–${refMax ?? "—"} ${unit}. ${lowerIsBetter ? "Une valeur basse est souhaitable." : ""}\n\nMa question : ${question}`,
        }),
      });
      const data = await res.json();
      setAnswer(data.answer ?? data.error ?? "Pas de réponse");
    } catch {
      setAnswer("Erreur de connexion");
    } finally {
      setQuestionLoading(false);
    }
  };

  const statusColor =
    latestStatus === "optimal"
      ? "text-[#15be53]"
      : latestStatus === "borderline"
        ? "text-[#64748d]"
        : "text-[#ea2261]";

  const statusLabel =
    latestStatus === "optimal" ? "Optimal" : latestStatus === "borderline" ? "Limite" : "Hors plage";

  return (
    <>
      {/* Retour */}
      <button
        onClick={() => router.push("/biologie")}
        className="flex items-center gap-1.5 text-sm text-[var(--color-body)] hover:text-[var(--color-heading)] transition-colors"
      >
        ← Retour à la biologie
      </button>

      {/* En-tête */}
      <div
        className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5"
        style={{ boxShadow: "var(--shadow-ambient)" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-normal text-[var(--color-heading)] dark:text-white">
              {label}
            </h1>
            <p className="text-[11px] text-[var(--color-body)] mt-0.5">
              {category.charAt(0).toUpperCase() + category.slice(1)} · {unit}
              {lowerIsBetter ? " · ↓ valeur basse souhaitable" : ""}
            </p>
          </div>
          {latest && (
            <div className="text-right shrink-0 ml-4">
              <p className={`text-2xl font-medium tabular-nums ${statusColor}`}>
                {latest.value < 10 ? latest.value.toFixed(2) : latest.value < 100 ? latest.value.toFixed(1) : Math.round(latest.value)}
              </p>
              <p className="text-[10px] text-[var(--color-body)]/60 mt-0.5">
                {unit} · <span className={statusColor}>{statusLabel}</span>
              </p>
            </div>
          )}
        </div>

        {description && (
          <p className="mt-3 text-[13px] text-[var(--color-body)] leading-relaxed">
            {description}
          </p>
        )}

        <div className="mt-3 flex items-center gap-3 text-[11px] text-[var(--color-body)]/60">
          <span className="inline-block w-3 h-1.5 rounded-sm bg-[#15be53]/20" />
          Plage optimale : {refMin ?? "—"} – {refMax ?? "—"} {unit}
        </div>
      </div>

      {/* Graphe d'évolution */}
      <section
        className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5 space-y-3"
        style={{ boxShadow: "var(--shadow-ambient)" }}
      >
        <h2 className="text-xs uppercase tracking-wide text-[var(--color-body)] font-normal">
          Évolution
        </h2>
        {history.length >= 2 ? (
          <EvolutionChart history={history} refMin={refMin} refMax={refMax} />
        ) : (
          <p className="text-sm text-[var(--color-body)]/60 py-4 text-center">
            Pas assez de données pour afficher un graphe (min. 2 bilans)
          </p>
        )}

        {/* Tableau historique */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]/50 dark:border-white/5">
                <th className="text-left text-[10px] uppercase tracking-wide text-[var(--color-body)] font-normal py-2">Date</th>
                <th className="text-right text-[10px] uppercase tracking-wide text-[var(--color-body)] font-normal py-2">Valeur</th>
                <th className="text-right text-[10px] uppercase tracking-wide text-[var(--color-body)] font-normal py-2">Δ</th>
                <th className="text-left text-[10px] uppercase tracking-wide text-[var(--color-body)] font-normal py-2 pl-3">Labo</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((h, i, arr) => {
                const status = getBiomarkerStatus(h.value, refMin, refMax);
                const prev = i < arr.length - 1 ? arr[i + 1] : null;
                const delta = prev ? h.value - prev.value : null;
                const deltaGood = delta != null && delta !== 0
                  ? lowerIsBetter ? delta < 0 : delta > 0
                  : null;

                return (
                  <tr key={h.date} className="border-b border-[var(--color-border)]/20 dark:border-white/3">
                    <td className="py-2 text-[13px] text-[var(--color-heading)] dark:text-white">
                      {new Date(h.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className={`py-2 text-right tabular-nums text-[13px] font-medium ${
                      status === "optimal" ? "text-[var(--color-heading)] dark:text-white" : status === "borderline" ? "text-[#64748d]" : "text-[#ea2261]"
                    }`}>
                      {h.value < 10 ? h.value.toFixed(2) : h.value < 100 ? h.value.toFixed(1) : Math.round(h.value)} {unit}
                    </td>
                    <td className={`py-2 text-right tabular-nums text-[11px] ${
                      deltaGood === null ? "text-[var(--color-body)]/40" : deltaGood ? "text-[#15be53]" : "text-[#ea2261]"
                    }`}>
                      {delta != null && delta !== 0
                        ? `${delta > 0 ? "+" : ""}${Math.abs(delta) < 10 ? delta.toFixed(2) : delta.toFixed(1)}`
                        : "—"}
                    </td>
                    <td className="py-2 pl-3 text-[11px] text-[var(--color-body)]/50">
                      {h.lab ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Analyse IA : description + recommandations */}
      <section
        className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 overflow-hidden"
        style={{ boxShadow: "var(--shadow-ambient)" }}
      >
        {!aiFetched && !aiAnalysis ? (
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-[var(--color-body)]">
                <span className="text-base">🤖</span>
                <span>
                  {isOptimal
                    ? "Que mesure ce marqueur ?"
                    : "Analyse et recommandations"}
                </span>
              </div>
              <button
                onClick={generateAnalysis}
                disabled={aiLoading}
                className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-brand-purple)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {aiLoading ? (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Analyse…
                  </span>
                ) : (
                  "Analyser"
                )}
              </button>
            </div>
            {aiError && <p className="mt-2 text-xs text-[#ea2261]">{aiError}</p>}
          </div>
        ) : aiAnalysis ? (
          <>
            <div className="px-4 py-3 bg-[var(--color-brand-purple)]/8 dark:bg-[var(--color-brand-purple)]/15 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🤖</span>
                <span className="text-sm font-medium text-[var(--color-heading)] dark:text-white">
                  Analyse IA — {label}
                </span>
              </div>
              <button
                onClick={generateAnalysis}
                disabled={aiLoading}
                className="text-[10px] px-2 py-1 rounded-md bg-[var(--color-border)]/20 dark:bg-white/5 text-[var(--color-body)] hover:text-[var(--color-heading)] transition-colors disabled:opacity-50"
              >
                {aiLoading ? "Analyse…" : "↻ Relancer"}
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[13px] text-[var(--color-heading)] dark:text-white leading-relaxed">
                {aiAnalysis.description}
              </p>
              {aiAnalysis.recommendations.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-[var(--color-body)]/60 font-medium">
                    Recommandations
                  </p>
                  {aiAnalysis.recommendations.map((reco, i) => (
                    <p key={i} className="text-[12px] text-[var(--color-body)] leading-relaxed pl-1">
                      {reco}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-body)]">🤖 Analyse IA</span>
              <button
                onClick={generateAnalysis}
                disabled={aiLoading}
                className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-brand-purple)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {aiLoading ? "Analyse…" : "Analyser"}
              </button>
            </div>
            {aiError && <p className="mt-2 text-xs text-[#ea2261]">{aiError}</p>}
          </div>
        )}
      </section>

      {/* Q&A */}
      <section
        className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5 space-y-3"
        style={{ boxShadow: "var(--shadow-ambient)" }}
      >
        <h2 className="text-xs uppercase tracking-wide text-[var(--color-body)] font-normal">
          💬 Poser une question
        </h2>
        <p className="text-[11px] text-[var(--color-body)]/60">
          Sur ce marqueur, un bilan spécifique, ou toutes vos données biologie.
        </p>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && askQuestion()}
            placeholder="Ex : Pourquoi ma ferritine est basse ?"
            className="flex-1 text-sm px-3 py-2 rounded-lg bg-[var(--color-border)]/10 dark:bg-white/5 border border-[var(--color-border)]/30 dark:border-white/10 text-[var(--color-heading)] dark:text-white placeholder:text-[var(--color-body)]/40 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-purple)]/50"
          />
          <button
            onClick={askQuestion}
            disabled={questionLoading || !question.trim()}
            className="text-sm px-4 py-2 rounded-lg bg-[var(--color-brand-purple)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {questionLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              "Envoyer"
            )}
          </button>
        </div>
        {answer && (
          <div className="p-3 rounded-lg bg-[var(--color-border)]/10 dark:bg-white/3 border border-[var(--color-border)]/20 dark:border-white/5 prose-sm">
            <ReactMarkdown
              components={{
                h1: ({ children }) => <p className="text-[14px] font-semibold text-[var(--color-heading)] dark:text-white mt-3 first:mt-0 mb-1.5">{children}</p>,
                h2: ({ children }) => <p className="text-[13px] font-semibold text-[var(--color-heading)] dark:text-white mt-3 first:mt-0 mb-1.5">{children}</p>,
                h3: ({ children }) => <p className="text-[13px] font-medium text-[var(--color-heading)] dark:text-white mt-2 first:mt-0 mb-1">{children}</p>,
                p: ({ children }) => <p className="text-[13px] text-[var(--color-heading)] dark:text-white leading-relaxed mb-2 last:mb-0">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold text-[var(--color-heading)] dark:text-white">{children}</strong>,
                ul: ({ children }) => <ul className="text-[13px] text-[var(--color-heading)] dark:text-white space-y-1 mb-2 pl-4 list-disc">{children}</ul>,
                ol: ({ children }) => <ol className="text-[13px] text-[var(--color-heading)] dark:text-white space-y-1 mb-2 pl-4 list-decimal">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
              }}
            >
              {answer}
            </ReactMarkdown>
          </div>
        )}
      </section>
    </>
  );
}
