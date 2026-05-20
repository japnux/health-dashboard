"use client";

import { MealPhotoButton } from "@/components/MealPhotoAnalyzer";
import type { SlotState } from "@/lib/meal-slots";

type MacroBar = {
  label: string;
  current: number;
  target: number;
  color: string;
  unit?: string;
};

type Props = {
  date: string;
  macros: { calories: number; proteines_g: number; glucides_g: number; lipides_g: number };
  targets: { calories: number; proteines_g: number; glucides_g: number; lipides_g: number };
  proteinFromLogs: number;
  adjustedTargets?: { calories: number; glucides_g: number };
  estimatedRemainingKcal?: number;
  activeSlot?: SlotState | null;
};

export function NutritionTracker({ date, macros, targets, proteinFromLogs, adjustedTargets, estimatedRemainingKcal, activeSlot }: Props) {
  const totalProtein = macros.proteines_g + proteinFromLogs;

  const hasAdjustment = adjustedTargets && adjustedTargets.calories !== targets.calories;
  const effectiveCalTarget = hasAdjustment ? adjustedTargets.calories : targets.calories;
  const effectiveGluTarget = hasAdjustment ? adjustedTargets.glucides_g : targets.glucides_g;

  const bars: MacroBar[] = [
    { label: "Cal", current: macros.calories, target: effectiveCalTarget, color: "bg-[#f97316]", unit: "kcal" },
    { label: "Prot", current: totalProtein, target: targets.proteines_g, color: "bg-[#15be53]" },
    { label: "Carb", current: macros.glucides_g, target: effectiveGluTarget, color: "bg-[#3b82f6]" },
    { label: "Fat", current: macros.lipides_g, target: targets.lipides_g, color: "bg-[#eab308]" },
  ];

  return (
    <section
      className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-xs font-normal uppercase tracking-wide text-[var(--color-body)]">
          Nutrition
        </h2>
        <MealPhotoButton date={date} compact label="Ajouter" />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {bars.map((b) => {
          const pct = b.target > 0 ? Math.min(100, Math.round((b.current / b.target) * 100)) : 0;
          const unit = b.unit ?? "g";
          return (
            <div key={b.label}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs text-[var(--color-body)]">{b.label}</span>
                <span className="text-xs tabular-nums text-[var(--color-heading)] dark:text-white">
                  {b.current}/{b.target}{unit}
                </span>
              </div>
              <div className="h-2 bg-[var(--color-border)] dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full ${b.color} transition-all rounded-full`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {hasAdjustment && (
        <p className="mt-2 text-[10px] text-[var(--color-body)]">
          ⚡ Objectifs ajustés aux workouts du jour
          {estimatedRemainingKcal ? ` (+${estimatedRemainingKcal} kcal restants à brûler)` : ""}
        </p>
      )}

      {/* Slot en cours */}
      {activeSlot && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)] dark:border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-brand-purple)]/15 text-[var(--color-brand-purple)] font-normal uppercase tracking-wide">
              En cours
            </span>
            <span className="text-xs text-[var(--color-heading)] dark:text-white font-normal">
              {activeSlot.slot.label}
            </span>
            <span className="text-[10px] text-[var(--color-body)]">
              {activeSlot.slot.startHour}h–{activeSlot.slot.endHour}h
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {([
              { key: "calories", label: "Cal", current: activeSlot.current.calories, target: activeSlot.adjustedTargets.calories, color: "bg-[#f97316]" },
              { key: "proteines_g", label: "P", current: activeSlot.current.proteines_g, target: activeSlot.adjustedTargets.proteines_g, color: "bg-[#15be53]" },
              { key: "glucides_g", label: "G", current: activeSlot.current.glucides_g, target: activeSlot.adjustedTargets.glucides_g, color: "bg-[#3b82f6]" },
              { key: "lipides_g", label: "L", current: activeSlot.current.lipides_g, target: activeSlot.adjustedTargets.lipides_g, color: "bg-[#eab308]" },
            ] as const).map((m) => {
              const pct = m.target > 0 ? Math.min(100, Math.round((m.current / m.target) * 100)) : 0;
              return (
                <div key={m.key}>
                  <div className="flex items-baseline justify-between mb-0.5">
                    <span className="text-[10px] text-[var(--color-body)]">{m.label}</span>
                    <span className="text-[10px] tabular-nums text-[var(--color-heading)] dark:text-white">
                      {m.current}/{m.target}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[var(--color-border)] dark:bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${m.color} rounded-full transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
