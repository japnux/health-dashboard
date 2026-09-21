"use client";

// Une mesure de composition corporelle (poids, masse grasse, masse maigre) :
// points de mesure reliés et droite de tendance (régression) en pointillés.
// Un graphique par mesure : jamais deux échelles sur le même graphique.

import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

type Point = { date: string; value: number };

function dayLabel(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

// Régression linéaire sur le temps (jours) : valeur de tendance à chaque date
function trendLine(points: Point[]): (number | null)[] {
  if (points.length < 3) return points.map(() => null);
  const xs = points.map((p) => Date.parse(`${p.date}T12:00:00Z`) / 86_400_000);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = points.reduce((a, p) => a + p.value, 0) / n;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += (x - mx) * (points[i].value - my);
    den += (x - mx) ** 2;
  });
  if (den === 0) return points.map(() => null);
  const slope = num / den;
  return xs.map((x) => Math.round((my + slope * (x - mx)) * 100) / 100);
}

export function BodyTrendChart({
  points,
  unit,
  color,
  decimals = 1,
  height = 180,
}: {
  points: Point[];
  unit: string;
  color: string;
  decimals?: number;
  height?: number;
}) {
  if (points.length === 0) return <p className="text-sm text-[var(--color-body)]">Pas de mesure sur la période.</p>;
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const trend = trendLine(sorted);
  const data = sorted.map((p, i) => ({ ...p, label: dayLabel(p.date), trend: trend[i] }));
  const values = sorted.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.2, 0.5);
  const fmt = (v: number) => `${v.toFixed(decimals).replace(".", ",")} ${unit}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" opacity={0.4} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis
          domain={[Math.floor((lo - pad) * 2) / 2, Math.ceil((hi + pad) * 2) / 2]}
          tick={{ fontSize: 11, fill: "#a1a1aa" }}
          axisLine={false}
          tickLine={false}
          width={36}
          tickFormatter={(v: number) => String(v).replace(".", ",")}
        />
        <Tooltip
          contentStyle={{ backgroundColor: "#27272a", border: "none", borderRadius: 8, color: "#fff", fontSize: 12 }}
          formatter={(val, name) => [fmt(Number(val)), name === "trend" ? "tendance" : "mesure"]}
        />
        <Line
          dataKey="trend"
          stroke={color}
          strokeOpacity={0.55}
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
        <Line
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={{ r: 3.5, fill: color, stroke: "#fff", strokeWidth: 1.5 }}
          isAnimationActive={false}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
