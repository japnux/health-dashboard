"use client";

// Historique d'une mesure : courbe sur fond de plage normale personnelle
// (vert), ou barres avec une ligne d'objectif (sommeil). Valeurs écrites sur
// les points en vue courte, dernier point mis en avant.

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  LabelList,
} from "recharts";
import { TOOLTIP_PROPS } from "@/components/charts/tooltip-style";

// color : couleur de la barre (verdict) ; sinon vert à l'objectif, bleu en dessous
type Point = { date: string; value: number; color?: string };

function dayLabel(date: string, short: boolean): string {
  return new Intl.DateTimeFormat(
    "fr-FR",
    short ? { weekday: "short", day: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" },
  ).format(new Date(`${date}T12:00:00Z`));
}

export function HistoryChart({
  points,
  unit,
  decimals = 0,
  band = null,
  target = null,
  mode = "line",
  valueSuffix = "",
  height = 240,
}: {
  height?: number;
  points: Point[];
  unit: string;
  decimals?: number;
  band?: { low: number; high: number } | null;
  target?: { value: number; label: string } | null;
  mode?: "line" | "bar";
  valueSuffix?: string;
}) {
  if (points.length === 0) return null;
  const short = points.length <= 14;
  const data = points.map((p) => ({ ...p, label: dayLabel(p.date, short) }));
  // Durées en heures lues en heures-minutes (6h24 plutôt que 6,4 h)
  const hours = unit === "h";
  const fmt = (v: number) =>
    hours
      ? `${Math.floor(Math.round(v * 60) / 60)}h${String(Math.round(v * 60) % 60).padStart(2, "0")}`
      : v.toFixed(decimals).replace(".", ",") + valueSuffix;
  const values = points.map((p) => p.value);
  const extra = [band?.low, band?.high, target?.value].filter((v): v is number => v != null);
  const lo = Math.min(...values, ...extra);
  const hi = Math.max(...values, ...extra);
  const pad = (hi - lo || 1) * 0.15;
  const domain: [number, number] = mode === "bar" ? [0, Math.ceil(hi + pad)] : [Math.floor((lo - pad) * 10) / 10, Math.ceil((hi + pad) * 10) / 10];
  const lastIndex = data.length - 1;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 22, right: 16, left: 0, bottom: 0 }}>
        {band && mode === "line" && (
          <ReferenceArea
            y1={band.low}
            y2={band.high}
            fill="#34c759"
            fillOpacity={0.12}
            label={{ value: "ta plage normale", position: "insideTopLeft", fontSize: 10, fill: "#1f7a3a" }}
          />
        )}
        {target && (
          <ReferenceLine
            y={target.value}
            stroke="#34c759"
            strokeDasharray="4 4"
            label={{ value: target.label, position: "insideTopRight", fontSize: 10, fill: "#1f7a3a" }}
          />
        )}
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" opacity={0.4} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} interval={short ? 0 : "preserveStartEnd"} />
        <YAxis
          domain={domain}
          tick={{ fontSize: 11, fill: "#a1a1aa" }}
          axisLine={false}
          tickLine={false}
          width={decimals > 0 ? 42 : 36}
          tickFormatter={(v: number) => String(Math.round(v * 10) / 10).replace(".", ",")}
        />
        <Tooltip
          {...TOOLTIP_PROPS}
          formatter={(val) => [hours ? fmt(val as number) : `${fmt(val as number)} ${unit}`.trim(), ""]}
          separator=""
        />
        {mode === "bar" ? (
          <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell
                key={d.date}
                fill={d.color ?? (target && d.value >= target.value ? "#34c759" : "#7ab8ff")}
                fillOpacity={i === lastIndex ? 1 : 0.75}
              />
            ))}
            {short && (
              <LabelList dataKey="value" position="top" formatter={(v) => fmt(Number(v))} style={{ fontSize: 10, fill: "#64748d" }} />
            )}
          </Bar>
        ) : (
          <Line
            dataKey="value"
            stroke="#64748d"
            strokeWidth={2}
            isAnimationActive={false}
            connectNulls={false}
            dot={(props) => {
              const { cx, cy, index } = props as { cx: number; cy: number; index: number };
              if (index === lastIndex) {
                return (
                  <g key={`d-${index}`}>
                    <circle cx={cx} cy={cy} r={9} fill="#007aff" fillOpacity={0.25} />
                    <circle cx={cx} cy={cy} r={4.5} fill="#007aff" stroke="#fff" strokeWidth={2} />
                  </g>
                );
              }
              return short ? (
                <circle key={`d-${index}`} cx={cx} cy={cy} r={3} fill="#fff" stroke="#64748d" strokeWidth={2} />
              ) : (
                <g key={`d-${index}`} />
              );
            }}
          >
            <LabelList
              dataKey="value"
              content={(props) => {
                const { x, y, value, index } = props as { x: number; y: number; value: number; index: number };
                if (!short && index !== lastIndex) return null;
                return (
                  <text x={x} y={y - 10} textAnchor="middle" fontSize={11} fontWeight={index === lastIndex ? 600 : 400} className="fill-[var(--color-heading)] dark:fill-white">
                    {fmt(value)}
                  </text>
                );
              }}
            />
          </Line>
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
