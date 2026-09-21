"use client";

// Courbe de fréquence cardiaque d'une séance, minute par minute, sur fond de
// zones cardio (mêmes couleurs que la répartition par zone).

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HR_ZONES } from "@/lib/hr-zones";

// Bornes des zones en % de la FC max (Z1 50-60 %, …, Z5 90-100 %)
const ZONE_BOUNDS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

function fmtMin(t: number): string {
  const h = Math.floor(t / 60);
  const m = Math.round(t % 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

export function WorkoutHrChart({ series, hrMax }: { series: [number, number, number][]; hrMax: number }) {
  const data = series.map(([t, avg, max]) => ({ t, avg, max }));
  const lo = Math.min(...data.map((d) => d.avg));
  const hi = Math.max(...data.map((d) => d.max));
  const domain: [number, number] = [Math.floor((lo - 8) / 10) * 10, Math.ceil((hi + 5) / 10) * 10];

  // Dégradé vertical à paliers : la courbe prend la couleur de sa zone.
  // Le dégradé suit la boîte de la courbe (de sa FC max à sa FC min).
  const avgs = data.map((d) => d.avg);
  const top = Math.max(...avgs);
  const bottom = Math.min(...avgs);
  const span = Math.max(1, top - bottom);
  const stops: { offset: number; color: string }[] = [];
  for (let i = HR_ZONES.length - 1; i >= -1; i--) {
    // Zone i couvre [ZONE_BOUNDS[i], ZONE_BOUNDS[i+1]] ; sous Z1 : couleur de Z1
    const hiBpm = i === HR_ZONES.length - 1 ? Infinity : ZONE_BOUNDS[i + 1] * hrMax;
    const loBpm = i >= 0 ? ZONE_BOUNDS[i] * hrMax : -Infinity;
    const color = HR_ZONES[Math.max(0, i)].color;
    const from = Math.min(1, Math.max(0, (top - Math.min(hiBpm, top)) / span));
    const to = Math.min(1, Math.max(0, (top - Math.max(loBpm, bottom)) / span));
    if (to > from) {
      stops.push({ offset: from, color }, { offset: to, color });
    }
  }
  const meanHr = Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length);

  const zoneOf = (bpm: number) => {
    const pct = bpm / hrMax;
    for (let i = HR_ZONES.length - 1; i >= 0; i--) if (pct >= ZONE_BOUNDS[i]) return HR_ZONES[i];
    return null;
  };

  return (
    // currentColor : la courbe suit la couleur du texte (lisible en clair et en sombre)
    <div className="text-zinc-900 dark:text-white">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="hr-zone-gradient" x1="0" y1="0" x2="0" y2="1">
              {stops.map((st, i) => (
                <stop key={i} offset={st.offset} stopColor={st.color} />
              ))}
            </linearGradient>
          </defs>
          {HR_ZONES.map((z, i) => {
            const y1 = Math.max(ZONE_BOUNDS[i] * hrMax, domain[0]);
            const y2 = Math.min(ZONE_BOUNDS[i + 1] * hrMax, domain[1]);
            if (y2 <= y1) return null;
            return (
              <ReferenceArea
                key={z.key}
                y1={y1}
                y2={y2}
                fill={z.color}
                fillOpacity={0.1}
                ifOverflow="hidden"
                label={{ value: z.label, position: "insideRight", fontSize: 10, fill: "#71717a" }}
              />
            );
          })}
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" opacity={0.4} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) => fmtMin(v)}
            tick={{ fontSize: 11, fill: "#a1a1aa" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis domain={domain} tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            contentStyle={{ backgroundColor: "#27272a", border: "none", borderRadius: 8, color: "#fff", fontSize: 12 }}
            labelFormatter={(v) => fmtMin(Number(v))}
            formatter={(val, key) => {
              const bpm = Number(val);
              const z = zoneOf(bpm);
              return [`${bpm} bpm${z ? ` · ${z.label} ${z.name}` : ""}`, key === "avg" ? "moyenne" : "max"];
            }}
          />
          <ReferenceLine
            y={meanHr}
            stroke="#a1a1aa"
            strokeWidth={1.5}
            label={{ value: `moy. ${meanHr}`, position: "insideTopLeft", fontSize: 11, fill: "#52525b" }}
          />
          <Line
            type="monotone"
            dataKey="avg"
            stroke={stops.length > 0 ? "url(#hr-zone-gradient)" : "currentColor"}
            strokeWidth={3}
            strokeLinecap="round"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[11px] text-[var(--color-body)] mt-1">
        FC moyenne de chaque minute, colorée selon la zone cardio (FC max {hrMax} bpm).
      </p>
    </div>
  );
}
