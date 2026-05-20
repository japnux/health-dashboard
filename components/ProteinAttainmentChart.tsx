"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts";
import type { DayProfileId } from "@/lib/meal-slots";

type ProteinDay = {
  date: string;
  protein: number;
  target: number;
  dayProfile: DayProfileId;
  workoutTypes: string[];
  isToday: boolean;
};

type Props = {
  data: ProteinDay[];
};

// Icônes par type de workout normalisé
const WORKOUT_ICONS: Record<string, string> = {
  surf: "🏄",
  musculation: "💪",
  yoga: "🧘",
  course: "🏃",
  natation: "🏊",
  marche: "🚶",
  randonnée: "🥾",
  vélo: "🚴",
};

function workoutIcon(types: string[]): string {
  if (types.length === 0) return "😴";
  // Si plusieurs types différents, concaténer les icônes (max 2)
  const unique = [...new Set(types.map((t) => WORKOUT_ICONS[t] ?? "🏋️"))];
  return unique.slice(0, 2).join("");
}

function shortLabel(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}

function barColor(protein: number, target: number, isToday: boolean): string {
  if (target === 0) return isToday ? "#15be5366" : "#15be53";
  const pct = protein / target;
  if (pct >= 0.9) return isToday ? "#15be5366" : "#15be53";
  if (pct >= 0.6) return isToday ? "#f9731666" : "#f97316";
  return isToday ? "#ea226166" : "#ea2261";
}

export function ProteinAttainmentChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-[var(--color-body)] py-4">
        Pas assez de données protéines pour le suivi 7j.
      </p>
    );
  }

  // Résumé : jours à objectif (≥90%) + moyenne d'atteinte
  const daysAtGoal = data.filter((d) => !d.isToday && d.target > 0 && d.protein / d.target >= 0.9).length;
  const pastDays = data.filter((d) => !d.isToday && d.target > 0);
  const totalDays = pastDays.length;
  const avgPct = totalDays > 0
    ? Math.round(pastDays.reduce((s, d) => s + (d.protein / d.target) * 100, 0) / totalDays)
    : 0;

  // Target de référence (le plus courant)
  const refTarget = data.length > 0 ? data[0].target : 150;
  const maxProtein = Math.max(...data.map((d) => d.protein), refTarget);
  const yMax = Math.ceil((maxProtein + 20) / 10) * 10;

  const chartData = data.map((d) => ({
    ...d,
    label: shortLabel(d.date),
    icon: workoutIcon(d.workoutTypes),
  }));

  return (
    <div>
      {/* Résumé */}
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-xs text-[var(--color-body)]">
          Atteinte protéines 7j
        </span>
        <span className="text-[10px] tabular-nums text-[var(--color-body)]">
          {daysAtGoal}/{totalDays} jours à objectif · moy {avgPct}%
        </span>
      </div>

      {/* Graphe */}
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 24 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "var(--color-body)" }}
              axisLine={false}
              tickLine={false}
            />
            {/* Deuxième axe X pour les icônes — aligné automatiquement */}
            <XAxis
              xAxisId="icons"
              dataKey="icon"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11 }}
              orientation="bottom"
              dy={2}
            />
            <YAxis
              domain={[0, yMax]}
              tick={{ fontSize: 10, fill: "var(--color-body)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}g`}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const d = payload[0].payload as ProteinDay & { label: string; icon: string };
                const pct = d.target > 0 ? Math.round((d.protein / d.target) * 100) : 0;
                const typeLabel = d.workoutTypes.length > 0 ? d.workoutTypes.join(", ") : "Repos";
                return (
                  <div className="rounded-lg bg-white dark:bg-[#1a2332] border border-[var(--color-border)] dark:border-white/10 p-2.5 text-xs shadow-lg">
                    <p className="font-normal text-[var(--color-heading)] dark:text-white mb-1">
                      {d.label} — {typeLabel}
                    </p>
                    <p className="text-[var(--color-body)]">
                      Protéines : {d.protein}g / {d.target}g
                    </p>
                    <p className={`font-normal ${pct >= 90 ? "text-[#15be53]" : pct >= 60 ? "text-[#f97316]" : "text-[#ea2261]"}`}>
                      {pct}% de l&apos;objectif
                    </p>
                    {d.isToday && (
                      <p className="text-[var(--color-body)] italic mt-0.5">En cours</p>
                    )}
                  </div>
                );
              }}
            />
            <ReferenceLine
              y={refTarget}
              stroke="var(--color-body)"
              strokeDasharray="4 3"
              strokeOpacity={0.5}
              label={{
                value: `${refTarget}g`,
                position: "right",
                fill: "var(--color-body)",
                fontSize: 9,
              }}
            />
            <Bar dataKey="protein" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={barColor(entry.protein, entry.target, entry.isToday)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
