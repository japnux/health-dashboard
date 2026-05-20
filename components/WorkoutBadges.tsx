"use client";

import { normalizeWorkoutType, workoutDisplayLabel, workoutEmoji } from "@/lib/workout-types";

type Workout = { type: string | null };

export function WorkoutBadges({ workouts }: { workouts: Workout[] }) {
  const counts = new Map<string, number>();
  for (const w of workouts) {
    const key = normalizeWorkoutType(w.type ?? "autre");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  if (counts.size === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {Array.from(counts.entries()).map(([type, count]) => (
        <span
          key={type}
          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-white/60 dark:bg-white/10 text-[var(--color-heading)] dark:text-white/80 border border-[var(--color-border)]/30 dark:border-white/10"
        >
          <span className="text-xs">{workoutEmoji(type)}</span>
          {workoutDisplayLabel(type)}
          {count > 1 && <span className="text-[var(--color-body)]/60">×{count}</span>}
        </span>
      ))}
    </div>
  );
}
