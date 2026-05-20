"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_SLOTS,
  DEFAULT_PROFILES,
  DAY_PROFILE_LABELS,
  type MealSlot,
  type DayProfileId,
  type DayProfilesConfig,
} from "@/lib/meal-slots";

type Config = {
  meal_slots_config: MealSlot[] | null;
  day_profiles_config: DayProfilesConfig | null;
};

const PROFILE_IDS: DayProfileId[] = ["off", "muscu", "surf"];

export function MealSlotsSettings() {
  const [slots, setSlots] = useState<MealSlot[]>(DEFAULT_SLOTS);
  const [profiles, setProfiles] = useState<DayProfilesConfig>(DEFAULT_PROFILES);
  const [activeProfile, setActiveProfile] = useState<DayProfileId>("off");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Charger la config existante
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data: Config & Record<string, unknown>) => {
        if (data.meal_slots_config) setSlots(data.meal_slots_config as MealSlot[]);
        if (data.day_profiles_config) setProfiles(data.day_profiles_config as DayProfilesConfig);
      })
      .catch(() => setError("Impossible de charger la configuration"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      // Charger la config complète puis la mettre à jour
      const current = await fetch("/api/config").then((r) => r.json());
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...current,
          meal_slots_config: slots,
          day_profiles_config: profiles,
        }),
      });
      if (!res.ok) throw new Error("Erreur sauvegarde");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setSlots(DEFAULT_SLOTS);
    setProfiles(DEFAULT_PROFILES);
  }

  function updateSlot(index: number, field: keyof MealSlot, value: string | number) {
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    );
  }

  function updateProfilePct(profileId: DayProfileId, slotId: string, value: number) {
    setProfiles((prev) => ({
      ...prev,
      [profileId]: { ...prev[profileId], [slotId]: value },
    }));
  }

  if (loading) {
    return (
      <div className="text-sm text-[var(--color-body)] py-12 text-center">
        Chargement…
      </div>
    );
  }

  const currentProfilePcts = profiles[activeProfile];
  const totalPct = slots.reduce((sum, s) => sum + (currentProfilePcts[s.id] ?? 0), 0);

  const inputClass =
    "w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] dark:border-white/10 bg-transparent px-2 py-1.5 text-sm text-[var(--color-heading)] dark:text-white outline-none focus:border-[var(--color-brand-purple)] tabular-nums";

  return (
    <div className="space-y-6">
      {/* Slots */}
      <section
        className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5"
        style={{ boxShadow: "var(--shadow-ambient)" }}
      >
        <h2 className="text-xs font-normal uppercase tracking-wide text-[var(--color-body)] mb-4">
          Créneaux repas
        </h2>
        <div className="space-y-3">
          {slots.map((slot, i) => (
            <div key={slot.id} className="flex items-center gap-3">
              <input
                type="text"
                value={slot.label}
                onChange={(e) => updateSlot(i, "label", e.target.value)}
                className={`${inputClass} flex-1`}
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={slot.startHour}
                  onChange={(e) => updateSlot(i, "startHour", +e.target.value)}
                  className={`${inputClass} w-16 text-center`}
                />
                <span className="text-xs text-[var(--color-body)]">→</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={slot.endHour}
                  onChange={(e) => updateSlot(i, "endHour", +e.target.value)}
                  className={`${inputClass} w-16 text-center`}
                />
                <span className="text-[10px] text-[var(--color-body)]">h</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Profils */}
      <section
        className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5"
        style={{ boxShadow: "var(--shadow-ambient)" }}
      >
        <h2 className="text-xs font-normal uppercase tracking-wide text-[var(--color-body)] mb-4">
          Répartition par profil
        </h2>

        {/* Onglets profil */}
        <div className="flex gap-1 rounded-[var(--radius-sm)] bg-[var(--color-border)]/30 dark:bg-white/5 p-0.5 mb-4">
          {PROFILE_IDS.map((pid) => (
            <button
              key={pid}
              onClick={() => setActiveProfile(pid)}
              className={`flex-1 text-xs py-1 rounded-[var(--radius-sm)] transition-colors ${
                activeProfile === pid
                  ? "bg-white dark:bg-white/10 text-[var(--color-heading)] dark:text-white shadow-sm font-normal"
                  : "text-[var(--color-body)] hover:text-[var(--color-heading)] dark:hover:text-white"
              }`}
            >
              {DAY_PROFILE_LABELS[pid]}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {slots.map((slot) => {
            const pct = currentProfilePcts[slot.id] ?? 0;
            return (
              <div key={slot.id} className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--color-body)] flex-1">{slot.label}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={50}
                    value={pct}
                    onChange={(e) => updateProfilePct(activeProfile, slot.id, +e.target.value)}
                    className="w-24 accent-[var(--color-brand-purple)]"
                  />
                  <span className="text-xs tabular-nums text-[var(--color-heading)] dark:text-white w-8 text-right">
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
          <div className="pt-2 border-t border-[var(--color-border)]/50 dark:border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-body)]">Total</span>
              <span
                className={`text-xs tabular-nums font-normal ${
                  totalPct === 100
                    ? "text-[#15be53]"
                    : "text-[#ea2261]"
                }`}
              >
                {totalPct}%
              </span>
            </div>
            {totalPct !== 100 && (
              <p className="text-[10px] text-[#ea2261] mt-1">
                La somme doit être égale à 100%.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-[var(--radius-sm)] bg-[var(--color-brand-purple)] text-white px-5 py-2 text-sm font-normal hover:bg-[var(--color-brand-purple-hover)] transition-colors disabled:opacity-50"
        >
          {saving ? "Sauvegarde…" : "Sauvegarder"}
        </button>
        <button
          onClick={handleReset}
          className="rounded-[var(--radius-sm)] border border-[var(--color-border)] dark:border-white/10 text-[var(--color-body)] px-4 py-2 text-sm hover:text-[var(--color-heading)] dark:hover:text-white transition-colors"
        >
          Réinitialiser
        </button>
        {saved && <span className="text-sm text-[#108c3d]">Enregistré</span>}
        {error && <span className="text-sm text-[#ea2261]">{error}</span>}
      </div>
    </div>
  );
}
