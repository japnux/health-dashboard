"use client";

import { useEffect, useState } from "react";

type SyncLog = {
  id: string;
  created_at: string;
  source: string;
  status: string;
  summary: string;
  days_processed: number;
  workouts_processed: number;
  details: string[] | null;
  http_headers: Record<string, string> | null;
  raw_payload: unknown;
};

const STATUS_STYLE: Record<string, string> = {
  ok: "text-[#108c3d] bg-[#15be53]/10",
  partial: "text-[#9b6829] bg-[#eab308]/10",
  error: "text-[#ea2261] bg-[#ea2261]/10",
  empty: "text-[var(--color-body)] bg-[var(--color-border)]/30",
};

const STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  partial: "Partiel",
  error: "Erreur",
  empty: "Vide",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SyncLogs() {
  const [logs, setLogs] = useState<SyncLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sync-logs")
      .then((r) => {
        if (!r.ok) throw new Error("Erreur chargement");
        return r.json();
      })
      .then(setLogs)
      .catch(() => setError("Impossible de charger les logs"));
  }, []);

  if (error) {
    return (
      <div className="text-sm text-[#ea2261] py-8 text-center">{error}</div>
    );
  }

  if (!logs) {
    return (
      <div className="text-sm text-[var(--color-body)] py-8 text-center">
        Chargement…
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-sm text-[var(--color-body)] py-8 text-center">
        Aucun log de synchronisation.
        <br />
        <span className="text-xs">
          Les logs apparaîtront après le premier envoi depuis Health Auto Export.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => {
        const isExpanded = expandedId === log.id;
        return (
          <div
            key={log.id}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] dark:border-white/10 overflow-hidden"
          >
            <button
              onClick={() => setExpandedId(isExpanded ? null : log.id)}
              className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[var(--color-border)]/20 dark:hover:bg-white/5 transition-colors"
            >
              <span
                className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${STATUS_STYLE[log.status] ?? STATUS_STYLE.error}`}
              >
                {STATUS_LABEL[log.status] ?? log.status}
              </span>
              <span className="text-sm text-[var(--color-heading)] dark:text-white flex-1 truncate">
                {log.summary}
              </span>
              <span className="text-xs text-[var(--color-body)] whitespace-nowrap">
                {formatDate(log.created_at)}
              </span>
              <span
                className="text-[var(--color-body)] text-xs transition-transform"
                style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}
              >
                ▾
              </span>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 border-t border-[var(--color-border)] dark:border-white/10 pt-3 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <MiniInfo label="Source" value={log.source} />
                  <MiniInfo label="Jours" value={String(log.days_processed)} />
                  <MiniInfo label="Workouts" value={String(log.workouts_processed)} />
                  <MiniInfo
                    label="Automation"
                    value={log.http_headers?.["automation-name"] ?? "—"}
                  />
                </div>

                {log.details && log.details.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--color-body)] mb-1">
                      Détails
                    </p>
                    <div className="bg-[var(--color-border)]/20 dark:bg-white/5 rounded-[var(--radius-sm)] p-2.5 space-y-0.5">
                      {log.details.map((d, i) => (
                        <p
                          key={i}
                          className={`text-xs font-mono ${d.includes("erreur") ? "text-[#ea2261]" : "text-[var(--color-body)]"}`}
                        >
                          {d}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {log.raw_payload != null && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-[var(--color-body)] hover:text-[var(--color-heading)] dark:hover:text-white">
                      Payload brut
                    </summary>
                    <pre className="mt-1 bg-[var(--color-border)]/20 dark:bg-white/5 rounded-[var(--radius-sm)] p-2.5 overflow-x-auto text-[10px] font-mono text-[var(--color-body)] max-h-64 overflow-y-auto">
                      {JSON.stringify(log.raw_payload, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[var(--color-body)]">{label} : </span>
      <span className="text-[var(--color-heading)] dark:text-white">{value}</span>
    </div>
  );
}
