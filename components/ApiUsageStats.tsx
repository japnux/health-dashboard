"use client";

import { useEffect, useState } from "react";

type ModelStat = { name: string; calls: number; cost_usd: number };
type EndpointStat = { name: string; calls: number; cost_usd: number };
type DayStat = {
  date: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  endpoints: EndpointStat[];
  models: ModelStat[];
};
type UsageData = {
  total: { cost_usd: number; calls: number; input_tokens: number; output_tokens: number };
  daily: DayStat[];
};

// Couleurs par modèle (alignées avec la console Anthropic)
const MODEL_COLORS: Record<string, string> = {
  "claude-sonnet-4-6": "#c0688e",
  "claude-haiku-4-5-20251001": "#a8c5b8",
  "claude-opus-4-6": "#533afd",
};

const MODEL_LABELS: Record<string, string> = {
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "claude-opus-4-6": "Opus 4.6",
};

function formatCost(usd: number): string {
  if (usd < 0.01) return `${(usd * 100).toFixed(2)}¢`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function ApiUsageStats() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/api-usage")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
      </div>
    );
  }

  if (!data || !data.daily?.length) {
    return (
      <div className="text-center py-12 text-[var(--color-body)]">
        <p className="text-sm">Aucune donnée d&apos;usage API pour le moment.</p>
        <p className="text-xs mt-1 opacity-60">Les appels seront tracés automatiquement.</p>
      </div>
    );
  }

  const maxCost = Math.max(...data.daily.map((d) => d.cost_usd));

  // Coût des 7 derniers jours vs 7 jours précédents
  const last7 = data.daily.slice(0, 7).reduce((s, d) => s + d.cost_usd, 0);
  const prev7 = data.daily.slice(7, 14).reduce((s, d) => s + d.cost_usd, 0);
  const trend = prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : 0;

  // Modèles utilisés (pour la légende)
  const allModels = new Set<string>();
  for (const day of data.daily) {
    for (const m of day.models ?? []) allModels.add(m.name);
  }

  return (
    <div className="space-y-4">
      {/* Résumé */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total (90j)" value={formatCost(data.total.cost_usd)} />
        <StatCard label="7 derniers jours" value={formatCost(last7)} trend={trend} />
        <StatCard label="Appels" value={data.total.calls.toString()} sub={`${formatTokens(data.total.input_tokens + data.total.output_tokens)} tokens`} />
      </div>

      {/* Graphique barres par jour — coloré par modèle */}
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white dark:bg-white/[0.03] p-4">
        <h3 className="text-sm font-medium text-[var(--color-heading)] dark:text-white mb-3">
          Coûts par jour
        </h3>
        <div className="space-y-1">
          {data.daily.slice(0, 30).map((day) => {
            const models = day.models ?? [];
            return (
              <button
                key={day.date}
                onClick={() => setExpandedDay(expandedDay === day.date ? null : day.date)}
                className="w-full text-left group"
              >
                <div className="flex items-center gap-2 py-1">
                  <span className="text-xs text-[var(--color-body)] w-14 shrink-0">
                    {formatDate(day.date)}
                  </span>
                  <div className="flex-1 h-5 rounded-sm overflow-hidden bg-[var(--color-border)]/20">
                    <div
                      className="h-full rounded-sm flex"
                      style={{ width: `${maxCost > 0 ? (day.cost_usd / maxCost) * 100 : 0}%` }}
                    >
                      {models.map((m) => (
                        <div
                          key={m.name}
                          title={`${MODEL_LABELS[m.name] ?? m.name}: ${formatCost(m.cost_usd)}`}
                          className="h-full"
                          style={{
                            width: `${day.cost_usd > 0 ? (m.cost_usd / day.cost_usd) * 100 : 0}%`,
                            backgroundColor: MODEL_COLORS[m.name] ?? "#94a3b8",
                            minWidth: m.cost_usd > 0 ? "2px" : "0",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="text-xs font-mono text-[var(--color-body)] w-16 text-right shrink-0">
                    {formatCost(day.cost_usd)}
                  </span>
                </div>

                {/* Détail par modèle + endpoint (expandable) */}
                {expandedDay === day.date && (
                  <div className="ml-16 mb-2 mt-1 space-y-1.5">
                    {/* Par modèle */}
                    {models.map((m) => (
                      <div key={m.name} className="flex items-center gap-2 text-xs">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: MODEL_COLORS[m.name] ?? "#94a3b8" }}
                        />
                        <span className="text-[var(--color-heading)] dark:text-white flex-1 truncate font-medium">
                          {MODEL_LABELS[m.name] ?? m.name}
                        </span>
                        <span className="font-mono text-[var(--color-body)]">{formatCost(m.cost_usd)}</span>
                        <span className="text-[var(--color-body)] opacity-50">{m.calls}×</span>
                      </div>
                    ))}
                    {/* Séparateur + détail endpoints */}
                    {day.endpoints.length > 0 && (
                      <>
                        <div className="border-t border-[var(--color-border)]/30 dark:border-white/5 my-1" />
                        {day.endpoints.map((ep) => (
                          <div key={ep.name} className="flex items-center gap-2 text-xs">
                            <span className="w-2 h-2 shrink-0" />
                            <span className="text-[var(--color-body)] flex-1 truncate">{ep.name}</span>
                            <span className="font-mono text-[var(--color-body)] opacity-60">{formatCost(ep.cost_usd)}</span>
                            <span className="text-[var(--color-body)] opacity-40">{ep.calls}×</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Légende modèles */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {[...allModels].map((model) => (
          <span key={model} className="flex items-center gap-1.5 text-xs text-[var(--color-body)]">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: MODEL_COLORS[model] ?? "#94a3b8" }}
            />
            {MODEL_LABELS[model] ?? model}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: number }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white dark:bg-white/[0.03] p-3">
      <p className="text-xs text-[var(--color-body)]">{label}</p>
      <p className="text-lg font-semibold text-[var(--color-heading)] dark:text-white mt-0.5">{value}</p>
      {sub && <p className="text-xs text-[var(--color-body)] opacity-60 mt-0.5">{sub}</p>}
      {trend !== undefined && trend !== 0 && (
        <p className={`text-xs mt-0.5 ${trend < 0 ? "text-emerald-600" : "text-red-500"}`}>
          {trend > 0 ? "↑" : "↓"} {Math.abs(Math.round(trend))}% vs sem. préc.
        </p>
      )}
    </div>
  );
}
