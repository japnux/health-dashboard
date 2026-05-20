"use client";

import { useEffect, useState } from "react";
import { JournalEntry } from "./JournalEntry";

type JournalData = {
  mood: number | null;
  energy: number | null;
  stress: number | null;
  notes: string | null;
  gratitude: string | null;
};

type ImpactFactor = {
  label: string;
  emoji: string;
  impact: number;
  sampleSize: number;
  direction: "positive" | "negative" | "neutral";
};

const MOOD_EMOJIS = ["", "😞", "😕", "😐", "🙂", "😄"];
const ENERGY_EMOJIS = ["", "🪫", "😴", "⚡", "💪", "🔥"];
const STRESS_EMOJIS = ["", "🧘", "😌", "😤", "😰", "🤯"];

export function JournalDashboard({ date, impact }: { date: string; impact?: ImpactFactor[] }) {
  const [data, setData] = useState<JournalData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetch(`/api/journal?date=${date}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.entry && (json.entry.mood != null || json.entry.energy != null || json.entry.notes || json.entry.gratitude)) {
          setData(json.entry);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [date]);

  function handleModalClose() {
    setShowModal(false);
    fetch(`/api/journal?date=${date}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.entry && (json.entry.mood != null || json.entry.energy != null || json.entry.notes || json.entry.gratitude)) {
          setData(json.entry);
        }
      })
      .catch(() => {});
  }

  if (!loaded) return null;

  const hasEntry = data && (data.mood != null || data.energy != null || data.notes || data.gratitude);

  return (
    <>
      <section
        className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5"
        style={{ boxShadow: "var(--shadow-ambient)" }}
      >
        <h2 className="text-xs uppercase tracking-wide text-[var(--color-body)] font-normal mb-3">
          Journal du jour
        </h2>

        {hasEntry ? (
          <button
            onClick={() => setShowModal(true)}
            className="w-full text-left"
          >
            <div className="flex items-center gap-3 mb-2">
              {data.mood != null && <span className="text-lg" title="Humeur">{MOOD_EMOJIS[data.mood]}</span>}
              {data.energy != null && <span className="text-lg" title="Énergie">{ENERGY_EMOJIS[data.energy]}</span>}
              {data.stress != null && <span className="text-lg" title="Stress">{STRESS_EMOJIS[data.stress]}</span>}
            </div>
            {data.notes && (
              <p className="text-sm text-[var(--color-body)] line-clamp-2">{data.notes}</p>
            )}
            {data.gratitude && (
              <p className="text-sm text-[var(--color-brand-purple)] line-clamp-1 mt-1">🙏 {data.gratitude}</p>
            )}
          </button>
        ) : (
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 text-sm text-[var(--color-label)] dark:text-white/70 hover:border-[var(--color-brand-purple-light)] hover:text-[var(--color-brand-purple)] transition-colors"
          >
            + Ajouter
          </button>
        )}

        {impact && impact.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[var(--color-border)]/50 dark:border-white/10">
            <p className="text-[10px] uppercase tracking-wide text-[var(--color-body)] mb-2">
              Impact sur le recovery
            </p>
            <div className="space-y-1">
              {impact.map((f) => (
                <div key={f.label} className="flex items-center gap-2 text-xs">
                  <span>{f.emoji}</span>
                  <span className="text-[var(--color-body)] flex-1">{f.label}</span>
                  <span className={`font-normal tabular-nums ${
                    f.direction === "positive" ? "text-[#108c3d]" :
                    f.direction === "negative" ? "text-[#ea2261]" :
                    "text-[var(--color-body)]"
                  }`}>
                    {f.impact > 0 ? "+" : ""}{f.impact} pts
                  </span>
                  <span className="text-[10px] text-[var(--color-body)]/50">
                    ({f.sampleSize}j)
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[var(--color-body)]/60 mt-1">
              Corrélation journal → recovery J+1 sur 60 jours
            </p>
          </div>
        )}
      </section>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) handleModalClose(); }}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto m-4">
            <button
              onClick={handleModalClose}
              className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--color-border)]/50 dark:bg-white/10 text-[var(--color-body)] hover:text-[var(--color-heading)] transition-colors"
            >
              ✕
            </button>
            <JournalEntry date={date} />
          </div>
        </div>
      )}
    </>
  );
}
