"use client";

import { useEffect, useState } from "react";

type Correlation = {
  id: string;
  inputMetric: string;
  outputMetric: string;
  direction: "positive" | "negative";
  magnitudePct: number;
  description: string;
  icon: string;
};

type CorrelationMeta = {
  generatedAt: string | null;
  dateRange: { start: string; end: string } | null;
};

export function AiCorrelations() {
  const [correlations, setCorrelations] = useState<Correlation[] | null>(null);
  const [meta, setMeta] = useState<CorrelationMeta>({ generatedAt: null, dateRange: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ai-correlations")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        setCorrelations(d.correlations ?? []);
        setMeta({
          generatedAt: d.generatedAt ?? null,
          dateRange: d.dateRange ?? null,
        });
      })
      .catch(() => setCorrelations(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section
        className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5 animate-pulse"
        style={{ boxShadow: "var(--shadow-ambient)" }}
      >
        <div className="h-3 w-40 bg-[var(--color-border)] dark:bg-white/10 rounded mb-4" />
        <div className="space-y-3">
          <div className="h-16 bg-[var(--color-border)] dark:bg-white/10 rounded" />
          <div className="h-16 bg-[var(--color-border)] dark:bg-white/10 rounded" />
          <div className="h-16 bg-[var(--color-border)] dark:bg-white/10 rounded" />
        </div>
      </section>
    );
  }

  if (!correlations || correlations.length === 0) return null;

  return (
    <section
      className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-xs font-normal uppercase tracking-wide text-[var(--color-body)]">
          Corrélations IA
        </h2>
        {meta.dateRange && (
          <span className="text-[10px] text-[var(--color-body)]/60 tabular-nums">
            {new Date(meta.dateRange.start).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
            {" → "}
            {new Date(meta.dateRange.end).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>
      <div className="space-y-3">
        {correlations.map((c) => {
          const isPositive = c.direction === "positive";
          const arrow = isPositive ? "↑" : "↓";
          const arrowColor = isPositive ? "text-[#108c3d]" : "text-[#ea2261]";
          const magnitudeColor = isPositive
            ? "text-[#108c3d] bg-[#15be53]/8 border-[#15be53]/15"
            : "text-[#ea2261] bg-[#ea2261]/8 border-[#ea2261]/15";

          return (
            <div
              key={c.id}
              className="rounded-[var(--radius-md)] bg-[var(--color-border)]/30 dark:bg-white/3 border border-[var(--color-border)] dark:border-white/8 p-3"
            >
              <div className="flex items-start gap-3">
                <span className="text-lg flex-shrink-0 mt-0.5">{c.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-normal text-[var(--color-heading)] dark:text-white">
                      {c.inputMetric}
                    </span>
                    <span className={`text-sm ${arrowColor}`}>{arrow}</span>
                    <span className="text-sm text-[var(--color-body)]">
                      {c.outputMetric}
                    </span>
                    <span
                      className={`text-xs font-normal px-2 py-0.5 rounded-[var(--radius-sm)] border ${magnitudeColor}`}
                    >
                      {c.magnitudePct > 0 ? "+" : ""}
                      {c.magnitudePct}%
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-body)] mt-1 leading-relaxed">
                    {c.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {meta.generatedAt && (
        <p className="text-[10px] text-[var(--color-body)]/50 mt-3 text-right">
          Généré le {new Date(meta.generatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </section>
  );
}
