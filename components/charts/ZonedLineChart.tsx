"use client";

// Courbe jour par jour sur fond de zones libellées (équilibre de charge,
// forme d'entraînement) : valeur écrite sur chaque point en vue courte,
// dernier point mis en avant dans la couleur de sa zone. Les zones sont
// choisies ici selon `kind` (les fonctions ne passent pas du serveur au client).

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
import { FORM_ZONES, formZone } from "@/lib/form";

type Point = { date: string; value: number; load?: number };
type Kind = "balance" | "form" | "recovery";

// Zones du score de récupération (mêmes seuils que recoveryColor)
const RECOVERY_ZONES = [
  { level: "red", from: 0, to: 5, color: "#ea2261", label: "faible" },
  { level: "yellow", from: 5, to: 7, color: "#eab308", label: "moyenne" },
  { level: "green", from: 7, to: 10.01, color: "#15be53", label: "bonne" },
];
const recoveryZone = (v: number) => RECOVERY_ZONES.find((z) => v < z.to) ?? RECOVERY_ZONES[RECOVERY_ZONES.length - 1];

const CONFIG = {
  balance: {
    zones: BALANCE_ZONES,
    zoneOf: balanceZone,
    format: (v: number) => v.toFixed(2).replace(".", ","),
    ticks: [0, 0.8, 1.3, 1.5],
    name: "Équilibre",
  },
  form: {
    zones: FORM_ZONES,
    zoneOf: formZone,
    format: (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0"),
    ticks: [-30, -10, 5, 25],
    name: "Forme",
  },
  recovery: {
    zones: RECOVERY_ZONES,
    zoneOf: recoveryZone,
    format: (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",")),
    ticks: [0, 5, 7, 10],
    name: "Récupération",
  },
} as const;

function dayLabel(date: string, long: boolean): string {
  const d = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat("fr-FR", long ? { weekday: "short", day: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

export function ZonedLineChart({ points, kind }: { points: Point[]; kind: Kind }) {
  if (points.length === 0) return null;
  const cfg = CONFIG[kind];
  const showValues = points.length <= 14;
  const data = points.map((p) => ({ ...p, label: dayLabel(p.date, showValues) }));
  const values = points.map((p) => p.value);
  const [yMin, yMax] =
    kind === "balance"
      ? [0, Math.max(1.8, Math.ceil((Math.max(...values) + 0.15) * 10) / 10)]
      : kind === "recovery"
        ? [0, 10]
        : [Math.min(-40, Math.floor(Math.min(...values) / 10) * 10 - 5), Math.max(35, Math.ceil(Math.max(...values) / 10) * 10 + 5)];
  const lastIndex = data.length - 1;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
        {cfg.zones.map((z) => (
          <ReferenceArea
            key={z.level}
            y1={Math.max(z.from, yMin)}
            y2={Math.min(z.to, yMax)}
            fill={z.color}
            fillOpacity={0.1}
            ifOverflow="hidden"
            // "sous-charge" en bas de sa bande : les points tombent souvent vers 0,7
            label={{
              value: z.label,
              position: z.level === "low" || z.level === "high_risk" || z.level === "red" ? "insideBottomLeft" : "insideTopLeft",
              fontSize: 10,
              fill: z.color,
            }}
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
          domain={[yMin, yMax]}
          ticks={[...cfg.ticks]}
          tickFormatter={(v: number) => (kind === "balance" ? String(v).replace(".", ",") : cfg.format(v))}
          tick={{ fontSize: 11, fill: "#a1a1aa" }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip
          contentStyle={{ backgroundColor: "#27272a", border: "none", borderRadius: 8, color: "#fff", fontSize: 12 }}
          formatter={(val, _name, item) => {
            const v = val as number;
            const load = (item?.payload as Point | undefined)?.load;
            return [`${cfg.format(v)} · ${cfg.zoneOf(v).label}${load != null ? ` (charge du jour ${load})` : ""}`, cfg.name];
          }}
        />
        <Line
          dataKey="value"
          stroke="#64748d"
          strokeWidth={2}
          isAnimationActive={false}
          dot={(props) => {
            const { cx, cy, index, payload } = props as { cx: number; cy: number; index: number; payload: Point };
            const isLast = index === lastIndex;
            const color = cfg.zoneOf(payload.value).color;
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
            dataKey="value"
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
                  {cfg.format(value)}
                </text>
              );
            }}
          />
        </Line>
      </LineChart>
    </ResponsiveContainer>
  );
}
