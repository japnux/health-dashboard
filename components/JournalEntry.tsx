"use client";

import { useState, useEffect, useRef } from "react";

type JournalData = {
  mood: number | null;
  energy: number | null;
  stress: number | null;
  notes: string | null;
  gratitude: string | null;
};

const MOOD_OPTIONS = [
  { value: 1, label: "😞", text: "Mauvais" },
  { value: 2, label: "😕", text: "Bof" },
  { value: 3, label: "😐", text: "Neutre" },
  { value: 4, label: "🙂", text: "Bien" },
  { value: 5, label: "😄", text: "Top" },
];

const ENERGY_OPTIONS = [
  { value: 1, label: "🪫", text: "Vide" },
  { value: 2, label: "😴", text: "Faible" },
  { value: 3, label: "⚡", text: "Ok" },
  { value: 4, label: "💪", text: "Bien" },
  { value: 5, label: "🔥", text: "Plein" },
];

const STRESS_OPTIONS = [
  { value: 1, label: "🧘", text: "Calme" },
  { value: 2, label: "😌", text: "Relax" },
  { value: 3, label: "😤", text: "Moyen" },
  { value: 4, label: "😰", text: "Tendu" },
  { value: 5, label: "🤯", text: "Max" },
];

export function JournalEntry({ date }: { date: string }) {
  const [data, setData] = useState<JournalData>({
    mood: null,
    energy: null,
    stress: null,
    notes: null,
    gratitude: null,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    fetch(`/api/journal?date=${date}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.entry) {
          setData({
            mood: json.entry.mood,
            energy: json.entry.energy,
            stress: json.entry.stress,
            notes: json.entry.notes,
            gratitude: json.entry.gratitude,
          });
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [date]);

  async function save(updated: JournalData) {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, ...updated }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function debouncedSave(updated: JournalData) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(updated), 800);
  }

  function handleSelect(field: "mood" | "energy" | "stress", value: number) {
    const next = { ...data, [field]: data[field] === value ? null : value };
    setData(next);
    save(next);
  }

  function handleTextChange(field: "notes" | "gratitude", value: string) {
    const next = { ...data, [field]: value || null };
    setData(next);
    debouncedSave(next);
  }

  if (!loaded) return null;

  return (
    <section
      className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs uppercase tracking-wide text-[var(--color-body)] font-normal">
          Journal du jour
        </h2>
        {saving && (
          <span className="text-[10px] text-[var(--color-body)]">Sauvegarde…</span>
        )}
        {saved && (
          <span className="text-[10px] text-[#108c3d]">Sauvegardé</span>
        )}
      </div>

      <div className="space-y-4">
        {/* Échelles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ScaleColumn
            label="Humeur"
            options={MOOD_OPTIONS}
            value={data.mood}
            onSelect={(v) => handleSelect("mood", v)}
          />
          <ScaleColumn
            label="Énergie"
            options={ENERGY_OPTIONS}
            value={data.energy}
            onSelect={(v) => handleSelect("energy", v)}
          />
          <ScaleColumn
            label="Stress"
            options={STRESS_OPTIONS}
            value={data.stress}
            onSelect={(v) => handleSelect("stress", v)}
          />
        </div>

        {/* Notes */}
        <div className="rounded-[var(--radius-md)] bg-[var(--color-border)]/30 dark:bg-white/3 p-3">
          <label className="text-[10px] uppercase tracking-wide text-[var(--color-body)] font-normal block mb-1.5">
            Notes
          </label>
          <textarea
            value={data.notes ?? ""}
            onChange={(e) => handleTextChange("notes", e.target.value)}
            placeholder="Douleurs, événements, remarques…"
            rows={2}
            className="w-full bg-transparent text-sm text-[var(--color-heading)] dark:text-white placeholder:text-[var(--color-body)]/40 focus:outline-none resize-none leading-relaxed"
          />
        </div>

        {/* Gratitude */}
        <div className="rounded-[var(--radius-md)] bg-[#f5f0ff] dark:bg-[var(--color-brand-purple)]/5 border border-[var(--color-brand-purple)]/10 p-3">
          <label className="text-[10px] uppercase tracking-wide text-[var(--color-brand-purple)] font-normal block mb-1.5">
            Gratitude — hier
          </label>
          <textarea
            value={data.gratitude ?? ""}
            onChange={(e) => handleTextChange("gratitude", e.target.value)}
            placeholder="3 choses pour lesquelles tu es reconnaissant…"
            rows={2}
            className="w-full bg-transparent text-sm text-[var(--color-heading)] dark:text-white placeholder:text-[var(--color-brand-purple)]/30 focus:outline-none resize-none leading-relaxed"
          />
        </div>
      </div>
    </section>
  );
}

function ScaleColumn({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: { value: number; label: string; text: string }[];
  value: number | null;
  onSelect: (v: number) => void;
}) {
  const selected = options.find((o) => o.value === value);

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-border)]/30 dark:bg-white/3 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wide text-[var(--color-body)] font-normal">
          {label}
        </span>
        {selected && (
          <span className="text-[10px] text-[var(--color-heading)] dark:text-white font-normal">
            {selected.text}
          </span>
        )}
      </div>
      <div className="flex justify-between">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            className={`w-9 h-9 rounded-[var(--radius-sm)] text-lg flex items-center justify-center transition-all ${
              value === opt.value
                ? "bg-[var(--color-brand-purple)]/12 border border-[var(--color-brand-purple)]/25 scale-110"
                : "hover:bg-white/60 dark:hover:bg-white/5 border border-transparent opacity-60 hover:opacity-100"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
