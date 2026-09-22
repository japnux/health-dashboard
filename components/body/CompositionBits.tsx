// Briques visuelles de la composition corporelle, sans état : utilisables
// sur l'accueil, la page /corps (serveur) et les statistiques (client).

import Link from "next/link";
import type { BodyTrend } from "@/lib/body-trend";
import type { Objective } from "@/lib/nutrition-calc";
import {
  FAT_COLOR,
  LEAN_COLOR,
  compositionVerdict,
  formatSlope,
  trendColor,
  type CompositionSnapshot,
} from "@/lib/body-composition";
import { tint, tintedBackground } from "@/lib/palette";

const fr = (v: number, d = 1) => v.toFixed(d).replace(".", ",");
const shortDate = (d: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

/** Barre de répartition masse maigre / masse grasse, en kg et en %. */
export function CompositionBar({ leanKg, fatKg }: { leanKg: number; fatKg: number }) {
  const total = leanKg + fatKg;
  const leanPct = (leanKg / total) * 100;
  return (
    <div>
      <div
        className="flex h-3 rounded-full overflow-hidden gap-[2px]"
        role="img"
        aria-label={`Masse maigre ${fr(leanKg)} kg, masse grasse ${fr(fatKg)} kg`}
      >
        <div style={{ width: `${leanPct}%`, backgroundColor: LEAN_COLOR }} />
        <div style={{ width: `${100 - leanPct}%`, backgroundColor: FAT_COLOR }} />
      </div>
      <div className="flex justify-between text-[11px] text-[var(--color-body)] mt-1.5">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: LEAN_COLOR }} />
          maigre {fr(leanKg)} kg · {Math.round(leanPct)} %
        </span>
        <span className="flex items-center gap-1.5">
          gras {fr(fatKg)} kg · {Math.round(100 - leanPct)} %
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: FAT_COLOR }} />
        </span>
      </div>
    </div>
  );
}

/** Une valeur (poids, gras, maigre) avec sa tendance colorée et sa date si ancienne. */
export function BodyValue({
  label,
  value,
  unit,
  sub,
  trend,
  trendUnit,
  color,
  date,
  today,
}: {
  label: string;
  value: string;
  unit: string;
  sub?: string;
  trend: BodyTrend | null;
  trendUnit: string;
  color: string;
  date: string | null;
  today: string;
}) {
  return (
    <div className="min-w-0 rounded-[var(--radius-md)] bg-[#061b31]/[0.04] dark:bg-white/[0.06] px-3 py-2.5">
      <p className="text-[11px] text-[var(--color-body)] truncate">{label}</p>
      <p className="text-[var(--color-heading)] dark:text-white">
        <span className="text-xl sm:text-2xl font-light tabular-nums">{value}</span>
        <span className="text-xs text-[var(--color-body)] ml-1">{unit}</span>
      </p>
      {sub && <p className="text-[10px] text-[var(--color-body)]">{sub}</p>}
      <p className="text-[11px] tabular-nums mt-0.5" style={{ color: trend ? color : undefined }}>
        {formatSlope(trend, trendUnit)}
      </p>
      {date && date !== today && <p className="text-[10px] text-[var(--color-body)]/80">mesure du {shortDate(date)}</p>}
    </div>
  );
}

/** Tuile de l'accueil : poids, gras, maigre, répartition et verdict. */
export function BodyCompositionTile({
  composition,
  trends,
  objective,
  today,
}: {
  composition: CompositionSnapshot;
  trends: { weight: BodyTrend | null; fat: BodyTrend | null; lean: BodyTrend | null };
  objective: Objective;
  today: string;
}) {
  const { weight, fatPct, fatKg, leanKg } = composition;
  if (!weight) return null;
  const verdict = compositionVerdict(trends, objective);
  return (
    <Link
      href="/corps"
      className="block rounded-[var(--radius-lg)] border p-4 sm:p-5 hover:opacity-95 transition-opacity"
      style={{ background: tintedBackground(verdict.color, 0.8), borderColor: tint(verdict.color, 0.3), boxShadow: "var(--shadow-ambient)" }}
    >
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-[var(--color-body)]">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: verdict.color }} />
          {verdict.label}
        </p>
        <span className="text-[var(--color-body)] text-lg leading-none" aria-hidden>
          ›
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <BodyValue
          label="Poids"
          value={fr(weight.value)}
          unit="kg"
          trend={trends.weight}
          trendUnit="kg"
          color={trendColor("weight", trends.weight, objective)}
          date={weight.date}
          today={today}
        />
        <BodyValue
          label="Masse grasse"
          value={fatPct ? fr(fatPct.value) : "—"}
          unit="%"
          sub={fatKg ? `${fr(fatKg.value)} kg` : undefined}
          trend={trends.fat}
          trendUnit="%"
          color={trendColor("fat", trends.fat, objective)}
          date={fatPct?.date ?? null}
          today={today}
        />
        <BodyValue
          label="Masse maigre"
          value={leanKg ? fr(leanKg.value) : "—"}
          unit="kg"
          trend={trends.lean}
          trendUnit="kg"
          color={trendColor("lean", trends.lean, objective)}
          date={leanKg?.date ?? null}
          today={today}
        />
      </div>
      {leanKg && fatKg && (
        <div className="mt-3">
          <CompositionBar leanKg={leanKg.value} fatKg={fatKg.value} />
        </div>
      )}
      <p className="text-sm text-[var(--color-heading)] dark:text-white mt-3">{verdict.text}</p>
    </Link>
  );
}
