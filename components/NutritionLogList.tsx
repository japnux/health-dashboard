"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type MealLog = {
  id: string;
  kind: "meal";
  label: string | null;
  source: string | null;
  calories: number;
  proteines_g: number;
  glucides_g: number;
  lipides_g: number;
  logged_at: string;
};

type ProteinLog = {
  id: string;
  kind: "protein";
  grams: number;
  label: string | null;
  logged_at: string;
};

type LogEntry = MealLog | ProteinLog;

export function NutritionLogList({
  meals,
  proteinLogs,
}: {
  meals: Omit<MealLog, "kind">[];
  proteinLogs: Omit<ProteinLog, "kind">[];
}) {
  const all: LogEntry[] = [
    ...meals.map((m) => ({ ...m, kind: "meal" as const })),
    ...proteinLogs.map((p) => ({ ...p, kind: "protein" as const })),
  ].sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime());

  return (
    <section
      className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <h2 className="text-xs font-normal uppercase tracking-wide text-[var(--color-body)] mb-3">
        Logs du jour
      </h2>
      {all.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border)] dark:divide-white/10">
          {all.map((entry) =>
            entry.kind === "meal" ? (
              <MealRow key={entry.id} meal={entry} />
            ) : (
              <ProteinRow key={entry.id} log={entry} />
            ),
          )}
        </ul>
      ) : (
        <p className="text-sm text-[var(--color-body)]">Aucun log aujourd&apos;hui.</p>
      )}
    </section>
  );
}

function MealRow({ meal }: { meal: MealLog }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch("/api/meal-log", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: meal.id }),
      });
      if (res.ok) startTransition(() => router.refresh());
    } finally {
      setDeleting(false);
    }
  }

  const time = new Date(meal.logged_at).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });

  return (
    <li className="flex justify-between items-center py-2.5">
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <span className="text-xs mt-0.5">🍽️</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--color-heading)] dark:text-white truncate">
              {meal.label || "Repas"}
            </span>
            <span className="text-[10px] text-[var(--color-body)] shrink-0">{time}</span>
          </div>
          <div className="flex gap-3 mt-0.5 text-xs tabular-nums text-[var(--color-body)]">
            <span>{meal.calories} kcal</span>
            <span className="text-[var(--color-heading)] dark:text-white font-normal">{meal.proteines_g}g P</span>
            <span>{meal.glucides_g}g G</span>
            <span>{meal.lipides_g}g L</span>
          </div>
        </div>
      </div>
      <button
        onClick={handleDelete}
        disabled={pending || deleting}
        className="text-xs text-[var(--color-body)] hover:text-[#ea2261] transition-colors disabled:opacity-30 shrink-0 ml-2"
      >
        {deleting ? "…" : "✕"}
      </button>
    </li>
  );
}

function ProteinRow({ log }: { log: ProteinLog }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch("/api/protein/log", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: log.id }),
      });
      if (res.ok) startTransition(() => router.refresh());
    } finally {
      setDeleting(false);
    }
  }

  const time = new Date(log.logged_at).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });

  return (
    <li className="flex justify-between items-center py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-xs">🥛</span>
        <span className="font-normal tabular-nums text-[var(--color-heading)] dark:text-white">
          +{log.grams}g P
        </span>
        {log.label && (
          <span className="text-xs text-[var(--color-label)] dark:text-white/70">{log.label}</span>
        )}
        <span className="text-[10px] text-[var(--color-body)]">{time}</span>
      </div>
      <button
        onClick={handleDelete}
        disabled={pending || deleting}
        className="text-xs text-[var(--color-body)] hover:text-[#ea2261] transition-colors disabled:opacity-30"
      >
        {deleting ? "…" : "✕"}
      </button>
    </li>
  );
}
