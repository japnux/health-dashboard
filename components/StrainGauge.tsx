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
        <p className="text-[11px] text-[var(--color-body)] mt-0.5">
          {strain.mode === "hr"
            ? `Charge cardio ${strain.cardioLoad}`
            : `Estimé sur ${strain.activeKcalToday} kcal`}
        </p>
        {strain.hasBaseline && strain.baselineAvg > 0 && (
          <p className="text-[11px] text-[var(--color-body)]">
            {/* La charge brute ne parle pas seule : on la situe par rapport à la moyenne */}
            {((strain.mode === "hr" ? (strain.cardioLoad ?? 0) : strain.activeKcalToday) / strain.baselineAvg)
              .toFixed(1)
              .replace(".", ",")}
            × ta moyenne 30 j ({strain.baselineAvg})
          </p>
        )}
      </div>
    </div>
  );
}
