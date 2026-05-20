"use client";

import { useState } from "react";
import { MealPhotoButton } from "@/components/MealPhotoAnalyzer";
import { ProteinAttainmentChart } from "@/components/ProteinAttainmentChart";
import { NutritionSlotView } from "@/components/NutritionSlotView";
import { DAY_PROFILE_LABELS } from "@/lib/meal-slots";
import type { SlotState, MealSlot, DayProfileId } from "@/lib/meal-slots";

type MacroBar = {
  label: string;
  current: number;
  target: number;
  color: string;
  unit?: string;
};

type ProteinDay = {
  date: string;
  protein: number;
  target: number;
  dayProfile: DayProfileId;
  workoutTypes: string[];
  isToday: boolean;
};

type Props = {
  date: string;
  macros: { calories: number; proteines_g: number; glucides_g: number; lipides_g: number };
  targets: { calories: number; proteines_g: number; glucides_g: number; lipides_g: number };
  proteinFromLogs: number;
  proteinAttainment7d: ProteinDay[];
  tdee: number;
  bmr: number;
  activeKcalToday: number;
  adjustedTargets?: { calories: number; glucides_g: number };
  estimatedRemainingKcal?: number;
  slotStates?: SlotState[];
  dayProfile?: DayProfileId;
  slots?: MealSlot[];
  objective?: string;
  isTrainingDay?: boolean;
  weightKg?: number;
};

export function NutritionPageTracker({ date, macros, targets, proteinFromLogs, proteinAttainment7d, tdee, bmr, activeKcalToday, adjustedTargets, estimatedRemainingKcal, slotStates, dayProfile, slots, objective, isTrainingDay, weightKg }: Props) {
  const [showMethode, setShowMethode] = useState(false);
  const [viewMode, setViewMode] = useState<"slots" | "totaux">("totaux");
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
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-normal uppercase tracking-wide text-[var(--color-body)]">
            Macros du jour
          </h2>
          {dayProfile && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-border)]/40 dark:bg-white/8 text-[var(--color-body)]">
              {DAY_PROFILE_LABELS[dayProfile]}
            </span>
          )}
        </div>
        <MealPhotoButton date={date} label="Ajouter" />
      </div>

      {/* Toggle Slots / Totaux */}
      {slotStates && slotStates.length > 0 && (
        <div className="flex gap-1 rounded-[var(--radius-sm)] bg-[var(--color-border)]/30 dark:bg-white/5 p-0.5 mb-4">
          <button
            onClick={() => setViewMode("totaux")}
            className={`flex-1 text-xs py-1 rounded-[var(--radius-sm)] transition-colors ${
              viewMode === "totaux"
                ? "bg-white dark:bg-white/10 text-[var(--color-heading)] dark:text-white shadow-sm font-normal"
                : "text-[var(--color-body)] hover:text-[var(--color-heading)] dark:hover:text-white"
            }`}
          >
            Totaux
          </button>
          <button
            onClick={() => setViewMode("slots")}
            className={`flex-1 text-xs py-1 rounded-[var(--radius-sm)] transition-colors ${
              viewMode === "slots"
                ? "bg-white dark:bg-white/10 text-[var(--color-heading)] dark:text-white shadow-sm font-normal"
                : "text-[var(--color-body)] hover:text-[var(--color-heading)] dark:hover:text-white"
            }`}
          >
            Slots
          </button>
        </div>
      )}

      {viewMode === "slots" && slotStates && slotStates.length > 0 ? (
        <NutritionSlotView slotStates={slotStates} dayProfile={dayProfile} />
      ) : (
        <>
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
                      <span className="text-[var(--color-body)] ml-1">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-2.5 bg-[var(--color-border)] dark:bg-white/10 rounded-full overflow-hidden">
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
        </>
      )}

      {/* Graphe principal : Atteinte protéines 7j */}
      {proteinAttainment7d.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[var(--color-border)] dark:border-white/10">
          <ProteinAttainmentChart data={proteinAttainment7d} />
        </div>
      )}

      {/* Section méthodologie */}
      <div className="mt-4 pt-3 border-t border-[var(--color-border)] dark:border-white/10">
        <button
          onClick={() => setShowMethode(!showMethode)}
          className="flex items-center gap-1.5 text-[11px] text-[var(--color-body)] hover:text-[var(--color-heading)] dark:hover:text-white transition-colors"
        >
          <span className="transition-transform" style={{ transform: showMethode ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
          Comment sont calculés mes objectifs ?
        </button>

        {showMethode && (
          <div className="mt-3 space-y-3 text-xs text-[var(--color-body)] leading-relaxed">
            {/* Objectif de base */}
            <div>
              <p className="font-medium text-[var(--color-heading)] dark:text-white mb-1">
                Objectif : {objective ?? "maintenance"} · {isTrainingDay ? "Jour training" : "Jour repos"}
              </p>
              <div className="rounded-[var(--radius-md)] bg-[var(--color-border)]/30 dark:bg-white/3 p-3 space-y-1 tabular-nums">
                <div className="flex justify-between">
                  <span>TDEE (dépense moyenne)</span>
                  <span className="text-[var(--color-heading)] dark:text-white">{tdee} kcal</span>
                </div>
                <div className="flex justify-between">
                  <span>Delta ({isTrainingDay ? "training" : "repos"})</span>
                  <span className="text-[var(--color-heading)] dark:text-white">{targets.calories - tdee >= 0 ? "+" : ""}{targets.calories - tdee} kcal</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-[var(--color-border)] dark:border-white/10 font-medium text-[var(--color-heading)] dark:text-white">
                  <span>Objectif base</span>
                  <span>{targets.calories} kcal</span>
                </div>
              </div>
            </div>

            {/* Ajustement du jour */}
            <div>
              <p className="font-medium text-[var(--color-heading)] dark:text-white mb-1">Ajustement temps réel</p>
              <div className="rounded-[var(--radius-md)] bg-[var(--color-border)]/30 dark:bg-white/3 p-3 space-y-1 tabular-nums">
                <div className="flex justify-between">
                  <span>BMR</span>
                  <span className="text-[var(--color-heading)] dark:text-white">{bmr} kcal</span>
                </div>
                <div className="flex justify-between">
                  <span>Kcal actives (Apple Watch)</span>
                  <span className="text-[var(--color-heading)] dark:text-white">{activeKcalToday} kcal</span>
                </div>
                {(estimatedRemainingKcal ?? 0) > 0 && (
                  <div className="flex justify-between">
                    <span>Workouts prévus restants</span>
                    <span className="text-[var(--color-heading)] dark:text-white">~{estimatedRemainingKcal} kcal</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Delta objectif</span>
                  <span className="text-[var(--color-heading)] dark:text-white">{targets.calories - tdee >= 0 ? "+" : ""}{targets.calories - tdee} kcal</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-[var(--color-border)] dark:border-white/10 font-medium text-[var(--color-heading)] dark:text-white">
                  <span>Objectif ajusté</span>
                  <span>{effectiveCalTarget} kcal</span>
                </div>
              </div>
              <p className="text-[10px] mt-1 opacity-70">
                Recalculé en temps réel : BMR + activité mesurée + workouts planifiés + delta objectif.
              </p>
            </div>

            {/* Répartition macros */}
            <div>
              <p className="font-medium text-[var(--color-heading)] dark:text-white mb-1">Répartition des macros</p>
              <div className="rounded-[var(--radius-md)] bg-[var(--color-border)]/30 dark:bg-white/3 p-3 space-y-1 tabular-nums">
                <div className="flex justify-between">
                  <span>Protéines ({weightKg ?? 78} kg × ratio)</span>
                  <span className="text-[var(--color-heading)] dark:text-white">{targets.proteines_g}g × 4 = {targets.proteines_g * 4} kcal</span>
                </div>
                <div className="flex justify-between">
                  <span>Lipides (% des cal.)</span>
                  <span className="text-[var(--color-heading)] dark:text-white">{targets.lipides_g}g × 9 = {targets.lipides_g * 9} kcal</span>
                </div>
                <div className="flex justify-between">
                  <span>Glucides (le reste)</span>
                  <span className="text-[var(--color-heading)] dark:text-white">{targets.glucides_g}g × 4 = {targets.glucides_g * 4} kcal</span>
                </div>
              </div>
              <p className="text-[10px] mt-1 opacity-70">
                Protéines = poids × ratio objectif. Lipides = % objectif des calories. Glucides = kcal restantes ÷ 4. Ajustement absorbé par les glucides.
              </p>
            </div>

          </div>
        )}
      </div>
    </section>
  );
}
