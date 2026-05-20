"use client";

import { useState } from "react";

type Activity = { type: string; emoji: string };

const ACTIVITY_TYPES: Activity[] = [
  { type: "Surf", emoji: "🏄" },
  { type: "Musculation", emoji: "🏋️" },
  { type: "Yoga", emoji: "🧘" },
  { type: "Natation", emoji: "🏊" },
  { type: "Course", emoji: "🏃" },
  { type: "Sauna", emoji: "🥵" },
  { type: "Repos", emoji: "😴" },
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

  return (
    <div className="pt-3 mt-3 border-t border-[var(--color-border)]/50 dark:border-white/10">
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-body)] mb-2">
        Activités prévues
      </p>
      <div className="flex flex-wrap gap-1.5">
        {ACTIVITY_TYPES.map((a) => {
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
                  className="text-[10px] text-[var(--color-body)] hover:text-[#ea2261] transition-colors disabled:opacity-50 px-0.5"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      {regenerating && (
        <div className="mt-2 flex items-center gap-2 text-xs text-[var(--color-body)]">
          <span className="inline-block w-3 h-3 border-2 border-[var(--color-brand-purple)]/30 border-t-[var(--color-brand-purple)] rounded-full animate-spin" />
          Mise à jour des recos…
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
