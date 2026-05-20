"use client";

import { strainColor } from "@/lib/strain-score";
import type { StrainResult } from "@/lib/strain-score";

type Props = {
  strain: StrainResult;
};

/**
 * Affichage compact du Strain Score avec barre de progression.
 */
export function StrainGauge({ strain }: Props) {
  const color = strainColor(strain.score);
  const pct = Math.min(100, Math.round((strain.score / 10) * 100));

  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span
          className="text-3xl font-light tabular-nums"
          style={{ color }}
        >
          {strain.score.toFixed(1)}
        </span>
        <span className="text-sm text-[var(--color-body)]">/10</span>
      </div>
      <p className="text-xs text-[var(--color-body)] mt-1">
        {strain.emoji} {strain.label}
      </p>
      {/* Barre de progression */}
      <div className="mt-3">
        <div className="h-2 bg-[var(--color-border)] dark:bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full transition-all rounded-full"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-[var(--color-body)] mt-1">
          <span>{strain.activeKcalToday} kcal actives</span>
          {strain.hasBaseline && <span>moy {strain.baselineAvg}</span>}
        </div>
      </div>
    </div>
  );
}
