"use client";

// Graphique de la page Équilibre de charge : ratio jour par jour sur fond de
// zones libellées, valeur écrite sur chaque point en vue 7 jours, dernier
// point mis en avant dans la couleur de sa zone.

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  LabelList,
} from "recharts";
import { BALANCE_ZONES, balanceZone } from "@/lib/load-balance";

type Point = { date: string; ratio: number; load: number };

function dayLabel(date: string, long: boolean): string {
  const d = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat("fr-FR", long ? { weekday: "short", day: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

export function LoadRatioChart({ points }: { points: Point[] }) {
  if (points.length === 0) return null;
  const showValues = points.length <= 14;
  const data = points.map((p) => ({ ...p, label: dayLabel(p.date, showValues) }));
  const values = points.map((p) => p.ratio);
  const yMax = Math.max(1.8, Math.ceil((Math.max(...values) + 0.15) * 10) / 10);
  const lastIndex = data.length - 1;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
        {BALANCE_ZONES.map((z) => (
          <ReferenceArea
            key={z.level}
            y1={z.from}
            y2={Math.min(z.to, yMax)}
            fill={z.color}
            fillOpacity={0.1}
            ifOverflow="hidden"
            // "sous-charge" en bas de sa bande : les points tombent souvent vers 0,7
            label={{ value: z.label, position: z.level === "low" ? "insideBottomLeft" : "insideTopLeft", fontSize: 10, fill: z.color }}
          />
        ))}
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" opacity={0.4} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#a1a1aa" }}
          axisLine={false}
          tickLine={false}
          interval={showValues ? 0 : "preserveStartEnd"}
        />
        <YAxis
          domain={[0, yMax]}
          ticks={[0, 0.8, 1.3, 1.5]}
          tickFormatter={(v: number) => String(v).replace(".", ",")}
          tick={{ fontSize: 11, fill: "#a1a1aa" }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip
          contentStyle={{ backgroundColor: "#27272a", border: "none", borderRadius: 8, color: "#fff", fontSize: 12 }}
          formatter={(val, _name, item) => {
            const r = val as number;
            const load = (item?.payload as Point | undefined)?.load;
            return [`${r.toFixed(2).replace(".", ",")} · ${balanceZone(r).label}${load != null ? ` (charge du jour ${load})` : ""}`, "Équilibre"];
          }}
        />
        <Line
          dataKey="ratio"
          stroke="#64748d"
          strokeWidth={2}
          isAnimationActive={false}
          dot={(props) => {
            const { cx, cy, index, payload } = props as { cx: number; cy: number; index: number; payload: Point };
            const isLast = index === lastIndex;
            const color = balanceZone(payload.ratio).color;
            if (isLast) {
              return (
                <g key={`dot-${index}`}>
                  <circle cx={cx} cy={cy} r={10} fill={color} fillOpacity={0.3} />
                  <circle cx={cx} cy={cy} r={5} className="fill-[#0d1520] dark:fill-white" stroke={color} strokeWidth={2.5} />
                </g>
              );
            }
            if (!showValues) return <g key={`dot-${index}`} />;
            return <circle key={`dot-${index}`} cx={cx} cy={cy} r={3.5} fill="#fff" stroke="#64748d" strokeWidth={2} />;
          }}
        >
          {/* Valeur sur chaque point en vue courte, sur le dernier sinon */}
          <LabelList
            dataKey="ratio"
            position="top"
            offset={10}
            content={(props) => {
              const { x, y, value, index } = props as { x: number; y: number; value: number; index: number };
              if (!showValues && index !== lastIndex) return null;
              return (
                <text
                  x={x}
                  y={y - 10}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={index === lastIndex ? 600 : 400}
                  className="fill-[var(--color-heading)] dark:fill-white"
                >
                  {value.toFixed(2).replace(".", ",")}
                </text>
              );
            }}
          />
        </Line>
      </LineChart>
    </ResponsiveContainer>
  );
}
