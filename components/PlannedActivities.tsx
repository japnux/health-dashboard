"use client";

import { useCallback, useRef, useState } from "react";
import { useDismiss } from "./useDismiss";

type Activity = { type: string; emoji: string; main?: boolean };

const ACTIVITY_TYPES: Activity[] = [
  { type: "Surf", emoji: "🏄", main: true },
  { type: "Musculation", emoji: "🏋️", main: true },
  { type: "Yoga", emoji: "🧘" },
  { type: "Natation", emoji: "🏊" },
  { type: "Course", emoji: "🏃" },
  { type: "Sauna", emoji: "🥵" },
  { type: "Repos", emoji: "😴", main: true },
];

type PlannedActivity = {
  type: string;
  count: number;
};

type Props = {
  date: string;
  activities: PlannedActivity[];
};

export function PlannedActivities({ date, activities }: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  // Activités secondaires dans un panneau flottant ("+ Autres") : la carte
  // garde sa hauteur, rien ne bouge autour
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  useDismiss(moreRef, moreOpen, closeMore);

  const countMap = new Map(activities.map((a) => [a.type, a.count]));

  async function updateCount(type: string, delta: number) {
    const current = countMap.get(type) ?? 0;
    const next = Math.max(0, current + delta);
    setPending(type);
    try {
      await fetch("/api/planned-activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, type, count: next }),
      });
      setPending(null);
      setRegenerating(true);
      await fetch("/api/ai-insights?refresh=1");
      window.location.reload();
    } catch {
      setPending(null);
      setRegenerating(false);
    }
  }

  const hasPlanned = activities.length > 0;

  const renderChip = (a: Activity) => {
    const count = countMap.get(a.type) ?? 0;
    const isActive = count > 0;
    const isPending = pending === a.type;

    return (
      <div key={a.type} className="flex items-center gap-0.5">
        <button
          type="button"
          disabled={isPending || regenerating}
          onClick={() => updateCount(a.type, 1)}
          className={`inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
            isActive
              ? "border-[var(--color-brand-purple)]/40 bg-[var(--color-brand-purple)]/5 text-[var(--color-brand-purple)]"
              : "border-[var(--color-border)] dark:border-white/10 bg-white dark:bg-white/5 text-[var(--color-label)] dark:text-white/70 hover:border-[var(--color-brand-purple-light)] hover:text-[var(--color-brand-purple)]"
          }`}
        >
          <span>{a.emoji}</span>
          <span>{a.type}</span>
          {isActive && (
            <span className="text-[10px] font-normal bg-[var(--color-brand-purple)] text-white rounded-full w-4 h-4 flex items-center justify-center">
              {count}
            </span>
          )}
        </button>
        {isActive && (
          <button
            type="button"
            disabled={isPending || regenerating}
            onClick={() => updateCount(a.type, -1)}
            className="text-[10px] text-[var(--color-body)] hover:text-[#c0271e] dark:hover:text-[#ff8a80] transition-colors disabled:opacity-50 px-0.5"
          >
            ✕
          </button>
        )}
      </div>
    );
  };

  // Visibles : principales et déjà prévues ; les autres dans "+ Autres"
  const isPlanned = (a: Activity) => (countMap.get(a.type) ?? 0) > 0;
  const visible = ACTIVITY_TYPES.filter((a) => a.main || isPlanned(a));
  const others = ACTIVITY_TYPES.filter((a) => !a.main && !isPlanned(a));

  return (
    <div className="pt-3 mt-3 border-t border-[var(--color-border)]/50 dark:border-white/10">
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-body)] mb-2">
        Activités prévues
      </p>
      {/* Panneau "+ Autres" calé sur toute la largeur des puces */}
      <div ref={moreRef} className="relative flex flex-wrap gap-1.5">
        {visible.map(renderChip)}
        {others.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setMoreOpen(!moreOpen)}
              aria-expanded={moreOpen}
              className="inline-flex items-center rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] dark:border-white/15 px-2 py-1 text-xs text-[var(--color-body)] hover:text-[var(--color-brand-purple)] hover:border-[var(--color-brand-purple-light)] transition-colors"
            >
              + Autres
            </button>
            {moreOpen && (
              <div className="absolute inset-x-0 top-full mt-1.5 z-30 flex flex-wrap gap-1.5 p-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] dark:border-white/10 bg-white dark:bg-[#131c28] shadow-[var(--shadow-elevated)]">
                {others.map(renderChip)}
              </div>
            )}
          </>
        )}
      </div>

      {regenerating && (
        <div className="mt-2 flex items-center gap-2 text-xs text-[var(--color-body)]">
          <span className="inline-block w-3 h-3 border-2 border-[var(--color-brand-purple)]/30 border-t-[var(--color-brand-purple)] rounded-full animate-spin" />
          Mise à jour des recommandations…
        </div>
      )}
      {!regenerating && hasPlanned && (
        <p className="mt-2 text-[10px] text-[var(--color-body)]">
          💡 Recos adaptées à ton plan.
        </p>
      )}
    </div>
  );
}
