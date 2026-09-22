"use client";

// Onglet "Coûts API" : dépense du mois et estimation, répartition par
// fonction (ce qui coûte), et détail jour par jour coloré par modèle.
// Les coûts sont recalculés côté serveur au tarif actuel.

import { useEffect, useState } from "react";
import { VIVID, TEXT } from "@/lib/palette";

type Item = { key: string; name: string; calls: number; cost_usd: number };
type DayStat = {
  date: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  models: Item[];
  features: Item[];
};
type UsageData = {
  tz: string;
  total: { cost_usd: number; calls: number; input_tokens: number; output_tokens: number };
  month: { cost_usd: number; calls: number; projected_usd: number };
  week: { last7_usd: number; prev7_usd: number };
  features30: Item[];
  daily: DayStat[];
};

// Couleur par modèle (palette du dashboard)
const MODEL_COLORS: Record<string, string> = {
  "claude-haiku-4-5-20251001": VIVID.cyan,
  "claude-sonnet-4-6": VIVID.purple,
  "claude-opus-4-6": VIVID.indigo,
};
const MODEL_LABELS: Record<string, string> = {
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-opus-4-6": "Opus 4.6",
};

function formatCost(usd: number): string {
  if (usd > 0 && usd < 0.01) return `${(usd * 100).toFixed(2).replace(".", ",")} ¢`;
  return `${usd.toFixed(2).replace(".", ",")} $`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} k`;
  return String(n);
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );
}

export function ApiUsageStats() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/api-usage")
      .then((r) => {
        if (!r.ok) throw new Error("Erreur chargement");
        return r.json() as Promise<UsageData>;
      })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-[var(--color-body)] py-12 text-center">Chargement…</div>;
  if (error) return <div className="text-sm text-[#c0271e] dark:text-[#ff8a80] py-12 text-center">Impossible de charger les coûts.</div>;
  if (!data || data.daily.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--color-body)]">
        <p className="text-sm">Aucun appel à l&apos;IA sur les 90 derniers jours.</p>
      </div>
    );
  }

  // 7 derniers jours calendaires contre les 7 précédents (calculés côté serveur)
  const last7 = data.week.last7_usd;
  const prev7 = data.week.prev7_usd;
  const trend = prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : null;
  const maxDay = Math.max(...data.daily.map((d) => d.cost_usd));
  const total30 = data.features30.reduce((s, f) => s + f.cost_usd, 0);
  const models = [...new Set(data.daily.flatMap((d) => d.models.map((m) => m.key)))];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Ce mois"
          value={formatCost(data.month.cost_usd)}
          sub={`≈ ${formatCost(data.month.projected_usd)} en fin de mois`}
        />
        <StatCard
          label="7 derniers jours"
          value={formatCost(last7)}
          sub={
            trend == null ? undefined : (
              <span style={{ color: trend <= 0 ? TEXT.green : TEXT.red }}>
                {trend > 0 ? "▲" : "▼"} {Math.abs(Math.round(trend))} % vs sem. préc.
              </span>
            )
          }
        />
        <StatCard
          label="90 jours"
          value={formatCost(data.total.cost_usd)}
          sub={`${data.total.calls} appels · ${formatTokens(data.total.input_tokens + data.total.output_tokens)} tokens`}
        />
      </div>

      {/* Ce qui coûte : répartition par fonction sur 30 jours */}
      <Card title="Par fonction · 30 jours">
        <div className="space-y-2.5">
          {data.features30.map((f) => {
            const pct = total30 > 0 ? (f.cost_usd / total30) * 100 : 0;
            return (
              <div key={f.key} className="flex items-center gap-3 text-sm">
                <span className="w-40 sm:w-52 shrink-0 truncate text-[var(--color-heading)] dark:text-white" title={f.key}>
                  {f.name}
                </span>
                <div className="flex-1 h-2.5 rounded-full bar-track overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: VIVID.blue }} />
                </div>
                <span className="w-16 text-right tabular-nums text-[var(--color-body)]">{formatCost(f.cost_usd)}</span>
                <span className="w-10 text-right tabular-nums text-[var(--color-body)]/70 text-xs">{f.calls}×</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Détail jour par jour, coloré par modèle */}
      <Card title="Par jour">
        <div className="space-y-1">
          {data.daily.slice(0, 30).map((day) => (
            <button
              key={day.date}
              onClick={() => setExpandedDay(expandedDay === day.date ? null : day.date)}
              className="w-full text-left"
            >
              <div className="flex items-center gap-2 py-1">
                <span className="text-xs text-[var(--color-body)] w-24 shrink-0">{formatDay(day.date)}</span>
                <div className="flex-1 h-4 rounded-sm overflow-hidden bar-track">
                  <div className="h-full flex" style={{ width: `${maxDay > 0 ? (day.cost_usd / maxDay) * 100 : 0}%` }}>
                    {day.models.map((m) => (
                      <div
                        key={m.key}
                        title={`${MODEL_LABELS[m.key] ?? m.key} : ${formatCost(m.cost_usd)}`}
                        className="h-full"
                        style={{
                          width: `${day.cost_usd > 0 ? (m.cost_usd / day.cost_usd) * 100 : 0}%`,
                          backgroundColor: MODEL_COLORS[m.key] ?? VIVID.gray,
                        }}
                      />
                    ))}
                  </div>
                </div>
                <span className="text-xs tabular-nums text-[var(--color-body)] w-16 text-right shrink-0">{formatCost(day.cost_usd)}</span>
              </div>
              {expandedDay === day.date && (
                <div className="ml-24 mb-2 mt-1 space-y-1">
                  {day.features.map((f) => (
                    <div key={f.key} className="flex items-center gap-2 text-xs">
                      <span className="text-[var(--color-heading)] dark:text-white flex-1 truncate">{f.name}</span>
                      <span className="tabular-nums text-[var(--color-body)]">{formatCost(f.cost_usd)}</span>
                      <span className="text-[var(--color-body)]/70 w-8 text-right">{f.calls}×</span>
                    </div>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-[var(--color-body)]">
          {models.map((m) => (
            <span key={m} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: MODEL_COLORS[m] ?? VIVID.gray }} />
              {MODEL_LABELS[m] ?? m}
            </span>
          ))}
          <span className="ml-auto">Clique sur un jour pour le détail par fonction.</span>
        </div>
      </Card>

      <p className="text-[11px] text-[var(--color-body)]">
        Coûts recalculés au tarif de chaque modèle à partir des tokens enregistrés (par million de tokens, entrée / sortie :
        Haiku 4.5 1 $ / 5 $, Sonnet 5 2 $ / 10 $, Opus 5.5 4 $ / 20 $). Les tendances et la séance suggérée utilisent Opus 5.5,
        3 fois par jour (4 avec deux séances). Estimation hors taxes.
      </p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <h2 className="text-xs font-normal uppercase tracking-wide text-[var(--color-body)] mb-4">{title}</h2>
      {children}
    </section>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div
      className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-3.5"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <p className="text-[11px] uppercase tracking-wide text-[var(--color-body)]">{label}</p>
      <p className="text-xl sm:text-2xl font-light tabular-nums text-[var(--color-heading)] dark:text-white mt-1">{value}</p>
      {sub && <p className="text-[11px] text-[var(--color-body)] mt-0.5">{sub}</p>}
    </div>
  );
}
