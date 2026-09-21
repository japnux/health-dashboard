"use client";

import { strainColor } from "@/lib/strain-score";
import type { StrainResult } from "@/lib/strain-score";
import { ScoreRing } from "@/components/ScoreRing";

type Props = {
  strain: StrainResult;
};

/**
 * Strain du jour : anneau de progression, niveau, et charge vs moyenne 30j.
 */
export function StrainGauge({ strain }: Props) {
  const color = strainColor(strain.score);

  return (
    <div className="flex items-center sm:flex-col sm:items-start gap-4 sm:gap-3 mt-2">
      <ScoreRing score={strain.score} color={color} label="Strain" />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm text-[var(--color-heading)] dark:text-white">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          {strain.label}
        </p>
        <p className="text-[11px] text-[var(--color-body)] mt-0.5 whitespace-nowrap">
          {strain.mode === "hr"
            ? `Charge cardio ${strain.cardioLoad}`
            : `Estimé sur ${strain.activeKcalToday} kcal`}
        </p>
        {strain.hasBaseline && (
          <p className="text-[11px] text-[var(--color-body)] whitespace-nowrap">
            moy 30j {strain.baselineAvg}
          </p>
        )}
      </div>
    </div>
  );
}
