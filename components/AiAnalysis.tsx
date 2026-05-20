"use client";

import { useState, useEffect, useRef } from "react";

type WeeklyResult = {
  mode: "weekly" | "daily";
  summary: string;
  insights: string[];
  recommendations: string[];
  alert: string | null;
};

type QuestionResult = {
  mode: "question";
  answer: string;
};

type AnalysisResult = WeeklyResult | QuestionResult;

type ChatEntry = {
  id: number;
  question: string;
  result: AnalysisResult | null;
  loading: boolean;
  error: string | null;
};

function sanitizeWeeklyResult(data: Record<string, unknown>, resultMode: "weekly" | "daily" = "weekly"): WeeklyResult {
  let summary = (data.summary as string) ?? "";
  let insights = (data.insights as string[]) ?? [];
  let recommendations = (data.recommendations as string[]) ?? [];
  let alert = (data.alert as string | null) ?? null;

  if (summary.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(summary);
      if (parsed.summary) {
        summary = parsed.summary;
        insights = Array.isArray(parsed.insights) ? parsed.insights : insights;
        recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : recommendations;
        alert = parsed.alert ?? alert;
      }
    } catch { /* on garde tel quel */ }
  }

  return {
    mode: resultMode,
    summary,
    insights: Array.isArray(insights) ? insights : [],
    recommendations: Array.isArray(recommendations) ? recommendations : [],
    alert,
  };
}

export function AiAnalysis() {
  const [open, setOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<WeeklyResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState<"daily" | "weekly" | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [question, setQuestion] = useState("");
  const nextId = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/ai-analysis")
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data?.cached && data.summary) {
          setAnalysisResult(sanitizeWeeklyResult(data));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat, analysisResult]);

  async function analyze(mode: "daily" | "weekly") {
    setAnalysisLoading(mode);
    setAnalysisError(null);

    try {
      const res = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as Record<string, string>).error ?? `Erreur ${res.status}`);
      }

      const data: WeeklyResult = await res.json();
      setAnalysisResult(sanitizeWeeklyResult(data, mode));
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setAnalysisLoading(null);
    }
  }

  async function askQuestion() {
    if (!question.trim()) return;

    const id = nextId.current++;
    const q = question.trim();
    setQuestion("");

    setChat((prev) => [...prev, { id, question: q, result: null, loading: true, error: null }]);

    try {
      const res = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "question", question: q }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as Record<string, string>).error ?? `Erreur ${res.status}`);
      }

      const data: QuestionResult = await res.json();
      setChat((prev) =>
        prev.map((e) => (e.id === id ? { ...e, result: data, loading: false } : e)),
      );
    } catch (err) {
      setChat((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, loading: false, error: err instanceof Error ? err.message : "Erreur" } : e,
        ),
      );
    }
  }

  const isLoading = analysisLoading != null;
  const hasContent = analysisResult != null || chat.length > 0;

  return (
    <>
      {/* Bulle flottante */}
      <div className="fixed bottom-5 right-5 z-50">
        {!open && hasContent && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#15be53] border-2 border-white dark:border-[#0d1520] pointer-events-none" />
        )}
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-14 h-14 rounded-full bg-[var(--color-brand-purple)] text-white flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          style={{
            boxShadow: "rgba(50,50,93,0.25) 0px 13px 27px -5px, rgba(0,0,0,0.1) 0px 8px 16px -8px",
          }}
          aria-label={open ? "Fermer l'analyse IA" : "Ouvrir l'analyse IA"}
        >
          {open ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          ) : (
            <span className="text-2xl leading-none">🧠</span>
          )}
        </button>
      </div>

      {/* Panel */}
      {open && (
        <div
          className="fixed z-50 inset-0 sm:inset-auto sm:bottom-24 sm:right-5 sm:w-[400px] sm:h-[min(600px,calc(100vh-120px))] bg-white dark:bg-[#0d1520] sm:rounded-[8px] sm:border sm:border-[var(--color-border)] dark:sm:border-white/10 flex flex-col overflow-hidden"
          style={{
            boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] dark:border-white/10 shrink-0 bg-white dark:bg-[#0d1520]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-[4px] bg-[var(--color-brand-purple)]/10 flex items-center justify-center">
                <span className="text-xs">🧠</span>
              </div>
              <h2 className="text-sm font-normal text-[var(--color-heading)] dark:text-white">
                Analyse IA
              </h2>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 rounded-[4px] flex items-center justify-center text-[var(--color-body)] hover:bg-[var(--color-border)]/50 dark:hover:bg-white/10 transition-colors"
              aria-label="Fermer"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M4 4l8 8M12 4L4 12" />
              </svg>
            </button>
          </div>

          {/* Contenu scrollable */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
            {/* Boutons analyse */}
            <div className="flex gap-2">
              <button
                onClick={() => analyze("daily")}
                disabled={isLoading}
                className="flex-1 text-[13px] font-normal px-3 py-2 rounded-[4px] border border-[var(--color-brand-purple)]/20 bg-[var(--color-brand-purple)]/5 text-[var(--color-brand-purple)] hover:bg-[var(--color-brand-purple)]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {analysisLoading === "daily" ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="inline-block w-3 h-3 border-2 border-[var(--color-brand-purple)]/30 border-t-[var(--color-brand-purple)] rounded-full animate-spin" />
                    Analyse…
                  </span>
                ) : (
                  "Analyse du jour"
                )}
              </button>
              <button
                onClick={() => analyze("weekly")}
                disabled={isLoading}
                className="flex-1 text-[13px] font-normal px-3 py-2 rounded-[4px] border border-[var(--color-brand-purple)]/20 bg-[var(--color-brand-purple)]/5 text-[var(--color-brand-purple)] hover:bg-[var(--color-brand-purple)]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {analysisLoading === "weekly" ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="inline-block w-3 h-3 border-2 border-[var(--color-brand-purple)]/30 border-t-[var(--color-brand-purple)] rounded-full animate-spin" />
                    Analyse…
                  </span>
                ) : (
                  "Analyse semaine"
                )}
              </button>
            </div>

            {/* Erreur */}
            {analysisError && (
              <div className="text-[13px] text-[#ea2261] bg-[#ea2261]/5 rounded-[4px] p-3 flex items-start gap-2">
                <span className="text-sm shrink-0">⚠️</span>
                <p>{analysisError}</p>
              </div>
            )}

            {/* Résultat analyse */}
            {analysisResult && !isLoading && (
              <WeeklyResultCard result={analysisResult} />
            )}

            {/* Historique questions */}
            {chat.map((entry) => (
              <ChatBubble key={entry.id} entry={entry} />
            ))}

            {/* État vide */}
            {!analysisResult && !isLoading && chat.length === 0 && !analysisError && (
              <div className="text-center py-8 text-[var(--color-body)]">
                <span className="text-3xl block mb-2">🧠</span>
                <p className="text-[13px]">Lance une analyse ou pose une question sur tes données.</p>
              </div>
            )}
          </div>

          {/* Zone de saisie */}
          <div className="shrink-0 px-4 py-3 border-t border-[var(--color-border)] dark:border-white/10 bg-white dark:bg-[#0d1520]">
            <div className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && question.trim()) askQuestion();
                }}
                placeholder="Question sur tes données…"
                className="flex-1 text-[13px] px-3 py-2 rounded-[4px] border border-[var(--color-border)] dark:border-white/10 bg-transparent text-[var(--color-heading)] dark:text-white placeholder:text-[var(--color-body)]/50 focus:outline-none focus:border-[var(--color-brand-purple)]/40 transition-colors"
              />
              <button
                onClick={askQuestion}
                disabled={!question.trim()}
                className="text-[13px] px-3 py-2 rounded-[4px] bg-[var(--color-brand-purple)] text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Sous-composants ────────────────────────────────────────────────────

function WeeklyResultCard({ result }: { result: WeeklyResult }) {
  return (
    <div className="space-y-3">
      {/* Alerte */}
      {result.alert && (
        <div className="rounded-[4px] bg-[#ea2261]/5 border border-[#ea2261]/20 p-3">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-[#ea2261]/15 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-[10px]">🚨</span>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#ea2261] font-medium mb-1">Alerte</p>
              <p className="text-[13px] text-[#ea2261] leading-relaxed">{result.alert}</p>
            </div>
          </div>
        </div>
      )}

      {/* Résumé */}
      <div className="rounded-[4px] border border-[var(--color-brand-purple)]/15 dark:border-[var(--color-brand-purple)]/10 overflow-hidden">
        <div className="flex">
          <div className="w-1 bg-[var(--color-brand-purple)]/40 shrink-0" />
          <div className="p-3 flex-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-xs">📋</span>
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-brand-purple)] font-medium">
                Bilan
              </p>
            </div>
            <p className="text-[13px] text-[var(--color-heading)] dark:text-white leading-relaxed">
              {result.summary}
            </p>
          </div>
        </div>
      </div>

      {/* Insights */}
      {result.insights.length > 0 && (
        <div className="rounded-[4px] border border-[var(--color-border)] dark:border-white/8 p-3">
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-body)] font-medium mb-2">
            Observations
          </p>
          <div className="space-y-2">
            {result.insights.map((insight, i) => {
              const { emoji, text } = splitEmoji(insight);
              return (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[13px] shrink-0 mt-px">{emoji || "💡"}</span>
                  <p className="text-[13px] text-[var(--color-heading)] dark:text-white/90 leading-relaxed">
                    {text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommandations */}
      {result.recommendations.length > 0 && (
        <div className="rounded-[4px] border border-[#15be53]/15 dark:border-[#15be53]/10 p-3">
          <p className="text-[10px] uppercase tracking-wide text-[#15be53] font-medium mb-2">
            Recommandations
          </p>
          <div className="space-y-2">
            {result.recommendations.map((reco, i) => {
              const { emoji, text } = splitEmoji(reco);
              return (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[13px] shrink-0 mt-px">{emoji || "→"}</span>
                  <p className="text-[13px] text-[var(--color-heading)] dark:text-white/90 leading-relaxed">
                    {text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ChatBubble({ entry }: { entry: ChatEntry }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[4px] bg-[var(--color-brand-purple)]/10 dark:bg-[var(--color-brand-purple)]/15 px-3 py-2">
          <p className="text-[13px] text-[var(--color-heading)] dark:text-white">{entry.question}</p>
        </div>
      </div>

      {entry.loading && (
        <div className="flex items-center gap-2 text-[13px] text-[var(--color-body)] px-1">
          <span className="inline-block w-3 h-3 border-2 border-[var(--color-brand-purple)]/30 border-t-[var(--color-brand-purple)] rounded-full animate-spin" />
          Réflexion…
        </div>
      )}

      {entry.error && (
        <div className="text-[13px] text-[#ea2261] bg-[#ea2261]/5 rounded-[4px] p-2.5 flex items-start gap-2">
          <span className="text-xs shrink-0">⚠️</span>
          <p>{entry.error}</p>
        </div>
      )}

      {entry.result && entry.result.mode === "question" && (
        <div className="max-w-[95%]">
          <div className="rounded-[4px] border border-[var(--color-border)] dark:border-white/8 px-3 py-2.5">
            <div className="text-[13px] text-[var(--color-heading)] dark:text-white leading-relaxed">
              <FormattedText text={entry.result.answer} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;

        if (/^[-•]\s/.test(trimmed)) {
          return (
            <div key={i} className="flex items-start gap-2 pl-1">
              <span className="text-[var(--color-brand-purple)] text-[8px] mt-[6px] shrink-0">●</span>
              <span>{formatInlineText(trimmed.replace(/^[-•]\s*/, ""))}</span>
            </div>
          );
        }

        const numMatch = trimmed.match(/^(\d+)[.)]\s/);
        if (numMatch) {
          return (
            <div key={i} className="flex items-start gap-2 pl-1">
              <span className="text-[var(--color-brand-purple)] text-[11px] tabular-nums font-medium mt-px shrink-0 w-4 text-right">
                {numMatch[1]}.
              </span>
              <span>{formatInlineText(trimmed.replace(/^\d+[.)]\s*/, ""))}</span>
            </div>
          );
        }

        return <p key={i}>{formatInlineText(trimmed)}</p>;
      })}
    </div>
  );
}

function splitEmoji(str: string): { emoji: string | null; text: string } {
  const match = str.match(/^(\p{Emoji_Presentation}|\p{Emoji}️)(‍(\p{Emoji_Presentation}|\p{Emoji}️))*/u);
  if (match) {
    return { emoji: match[0], text: str.slice(match[0].length).trim() };
  }
  return { emoji: null, text: str };
}

function formatInlineText(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-medium text-[var(--color-heading)] dark:text-white">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
