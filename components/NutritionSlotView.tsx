"use client";

import { useState } from "react";
import type { SlotState, DayProfileId } from "@/lib/meal-slots";

const SLOT_ICONS: Record<string, string> = {
  petit_dej: "🌅",
  collation_am: "🍎",
  dejeuner: "🍽️",
  collation_pm: "☕",
  diner: "🌙",
};

type Props = {
  slotStates: SlotState[];
  dayProfile?: DayProfileId;
};

export function NutritionSlotView({ slotStates, dayProfile }: Props) {
  // Trouver le premier slot actif ou futur pour la suggestion
  const firstActiveOrFuture = slotStates.find((s) => s.status === "active" || s.status === "future");

  // Calculer le delta global restant (somme des gaps de tous les slots non passés)
  const remainingSlots = slotStates.filter((s) => s.status === "active" || s.status === "future");
  const totalRemainingTarget = remainingSlots.reduce(
    (acc, s) => ({
      p: acc.p + s.adjustedTargets.proteines_g - s.current.proteines_g,
      g: acc.g + s.adjustedTargets.glucides_g - s.current.glucides_g,
      l: acc.l + s.adjustedTargets.lipides_g - s.current.lipides_g,
    }),
    { p: 0, g: 0, l: 0 },
  );

  return (
    <div className="space-y-2">
      {slotStates.map((ss) => (
        <SlotCard
          key={ss.slot.id}
          state={ss}
          dayProfile={dayProfile}
          showSuggestion={ss === firstActiveOrFuture}
          remainingMacros={totalRemainingTarget}
        />
      ))}
    </div>
  );
}

function SlotCard({
  state,
  dayProfile,
  showSuggestion,
  remainingMacros,
}: {
  state: SlotState;
  dayProfile?: DayProfileId;
  showSuggestion: boolean;
  remainingMacros: { p: number; g: number; l: number };
}) {
  const { slot, adjustedTargets, current, meals, proteinLogs, status } = state;
  const icon = SLOT_ICONS[slot.id] ?? "🍴";
  const isEmpty = current.calories === 0 && meals.length === 0 && proteinLogs.length === 0;
  const isCollapsible = status === "past" && isEmpty;

  // Auto-collapse si passé et vide
  const [expanded, setExpanded] = useState(!isCollapsible);

  // Slot passé vide → affichage compact
  if (isCollapsible && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)]/40 dark:border-white/5 px-3 py-2 opacity-40 hover:opacity-60 transition-opacity text-left"
      >
        <span className="text-xs">{icon}</span>
        <span className="text-[11px] text-[var(--color-heading)] dark:text-white">{slot.label}</span>
        <span className="text-[10px] text-[var(--color-body)]">{slot.startHour}h-{slot.endHour}h</span>
        <span className="text-[10px] text-[#ea2261]/70 ml-auto">Non loggué</span>
      </button>
    );
  }

  // Gaps macro pour slots passés loggués
  const gapP = adjustedTargets.proteines_g - current.proteines_g;
  const gapG = adjustedTargets.glucides_g - current.glucides_g;
  const gapL = adjustedTargets.lipides_g - current.lipides_g;
  const hasGap = status === "past" && !isEmpty && (gapP !== 0 || gapG !== 0 || gapL !== 0);

  // Badges écart (correction 4)
  const isOff = dayProfile === "off";

  // Mini barres macro avec badges
  const macros = [
    { key: "calories" as const, label: "Cal", current: current.calories, target: adjustedTargets.calories, color: "bg-[#f97316]", unit: "", macro: "cal" as const },
    { key: "proteines_g" as const, label: "P", current: current.proteines_g, target: adjustedTargets.proteines_g, color: "bg-[#15be53]", unit: "g", macro: "p" as const },
    { key: "glucides_g" as const, label: "G", current: current.glucides_g, target: adjustedTargets.glucides_g, color: "bg-[#3b82f6]", unit: "g", macro: "g" as const },
    { key: "lipides_g" as const, label: "L", current: current.lipides_g, target: adjustedTargets.lipides_g, color: "bg-[#eab308]", unit: "g", macro: "l" as const },
  ];

  return (
    <div
      className={`rounded-[var(--radius-md)] border p-3 transition-colors ${
        status === "active"
          ? "border-[var(--color-brand-purple)]/40 dark:border-[var(--color-brand-purple)]/30 bg-[var(--color-brand-purple)]/3 dark:bg-[var(--color-brand-purple)]/5"
          : status === "past"
            ? "border-[var(--color-border)]/60 dark:border-white/5 opacity-60"
            : "border-[var(--color-border)] dark:border-white/10"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <span className="text-xs font-normal text-[var(--color-heading)] dark:text-white">
            {slot.label}
          </span>
          <span className="text-[10px] text-[var(--color-body)]">
            {slot.startHour}h-{slot.endHour}h
          </span>
          {status === "active" && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-brand-purple)]/15 text-[var(--color-brand-purple)] font-normal">
              En cours
            </span>
          )}
        </div>
        <div className="text-[10px] tabular-nums text-[var(--color-body)]">
          {current.calories} / {adjustedTargets.calories} kcal
        </div>
      </div>

      {/* Mini barres macro — masquées pour les slots futurs sans log */}
      {status !== "future" && (
        <div className="grid grid-cols-4 gap-2 mb-2">
          {macros.map((m) => {
            const pct = m.target > 0 ? Math.min(100, Math.round((m.current / m.target) * 100)) : 0;
            const badge = status === "past" && !isEmpty ? getMacroBadge(m.macro, m.current, m.target, isOff) : null;

            return (
              <div key={m.key}>
                <div className="flex items-baseline justify-between mb-0.5">
                  <span className="text-[10px] text-[var(--color-body)]">{m.label}</span>
                  <span className={`text-[10px] tabular-nums ${badge ? badge.textColor : "text-[var(--color-heading)] dark:text-white"}`}>
                    {m.current}{m.unit}
                  </span>
                </div>
                <div className="h-1.5 bg-[var(--color-border)] dark:bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${badge ? badge.barColor : m.color} rounded-full transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Gaps macro détaillés — slots passés loggués */}
      {hasGap && (
        <p className="text-[10px] text-[var(--color-body)] tabular-nums">
          {gapP > 0 || gapG > 0 || gapL > 0 ? "↘ " : "↗ "}
          {[
            gapP !== 0 ? `${Math.abs(gapP)}g P` : null,
            gapG !== 0 ? `${Math.abs(gapG)}g G` : null,
            gapL !== 0 ? `${Math.abs(gapL)}g L` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          {gapP > 0 || gapG > 0 || gapL > 0 ? " à rattraper" : " en surplus"}
        </p>
      )}

      {/* Suggestion textuelle — slot actif ou premier futur */}
      {showSuggestion && (remainingMacros.p > 0 || remainingMacros.g > 0) && (
        <p className="text-[10px] text-[var(--color-brand-purple)] dark:text-[var(--color-brand-purple-light)] mt-1">
          💡 {slotSuggestionText(slot.label, remainingMacros)}
        </p>
      )}

      {/* Logs du slot */}
      {(meals.length > 0 || proteinLogs.length > 0) && (
        <div className="mt-2 pt-2 border-t border-[var(--color-border)]/50 dark:border-white/5 space-y-1">
          {meals.map((m) => {
            const time = new Date(m.logged_at).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Paris",
            });
            return (
              <div key={m.id} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[10px]">🍽️</span>
                  <span className="text-[var(--color-heading)] dark:text-white truncate">
                    {m.label || "Repas"}
                  </span>
                  <span className="text-[var(--color-body)] shrink-0">{time}</span>
                </div>
                <div className="flex gap-2 tabular-nums text-[var(--color-body)] shrink-0 ml-2">
                  <span>{m.calories}kcal</span>
                  <span className="text-[var(--color-heading)] dark:text-white">{m.proteines_g}P</span>
                </div>
              </div>
            );
          })}
          {proteinLogs.map((p) => {
            const time = new Date(p.logged_at).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Paris",
            });
            return (
              <div key={p.id} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px]">🥛</span>
                  <span className="text-[var(--color-heading)] dark:text-white">+{p.grams}g P</span>
                  {p.label && <span className="text-[var(--color-body)]">{p.label}</span>}
                  <span className="text-[var(--color-body)]">{time}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

type MacroType = "cal" | "p" | "g" | "l";

/** Badge coloré si un macro dépasse >120% ou est <50% de la cible */
function getMacroBadge(
  macro: MacroType,
  current: number,
  target: number,
  isOff: boolean,
): { barColor: string; textColor: string } | null {
  if (target === 0) return null;
  const ratio = current / target;

  // Glucides : pas de badge en jour repos (tolérance large)
  if (macro === "g" && isOff) return null;

  // Dépassement >120% → rouge pour lipides/calories, orange pour le reste
  if (ratio > 1.2) {
    if (macro === "l" || macro === "cal") {
      return { barColor: "bg-[#ea2261]", textColor: "text-[#ea2261]" };
    }
    return { barColor: "bg-[#f97316]", textColor: "text-[#f97316]" };
  }

  // Insuffisant <50% → orange pour protéines, gris discret pour le reste
  if (ratio < 0.5) {
    if (macro === "p") {
      return { barColor: "bg-[#f97316]", textColor: "text-[#f97316]" };
    }
  }

  return null;
}

/** Génère le texte de suggestion pour le slot actif/prochain */
function slotSuggestionText(
  slotLabel: string,
  remaining: { p: number; g: number; l: number },
): string {
  const parts: string[] = [];
  if (remaining.p > 0) parts.push(`~${remaining.p}g P`);
  if (remaining.g > 0) parts.push(`${remaining.g}g G`);

  if (parts.length === 0) return `${slotLabel} : macros en bonne voie.`;

  const label = slotLabel.toLowerCase();
  return `Viser ${parts.join(" et ")} sur les prochains repas pour finir la journée.`;
}
