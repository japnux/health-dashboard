"use client";

import { useEffect, useState } from "react";
import { NUTRITION_ENABLED } from "@/lib/features";
import {
  parseObjective,
  computeBaseTargets,
  OBJECTIVE_CONFIGS,
} from "@/lib/nutrition-calc";

type Config = {
  sleep_target_min: number;
  steps_target: number;
  user_age: number | null;
  user_sex: string | null;
  user_height_cm: number | null;
  user_objective: string | null;
  user_activity: string | null;
  user_goals: string | null;
  bmr_kcal: number | null;
  tdee_kcal: number | null;
};

export function SettingsForm() {
  const [config, setConfig] = useState<(Config & { latest_weight_kg?: number }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setError("Impossible de charger la configuration"));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
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

  if (!config) {
    return (
      <div className="text-sm text-[var(--color-body)] py-12 text-center">
        {error ?? "Chargement…"}
      </div>
    );
  }

  const sleepH = Math.floor(config.sleep_target_min / 60);
  const sleepM = config.sleep_target_min % 60;

  // Auto-calcul macros selon objectif
  const objective = parseObjective(config.user_objective);
  const objCfg = OBJECTIVE_CONFIGS[objective];
  const weightKg = config.latest_weight_kg ?? 70;
  const tdee = config.tdee_kcal ?? 2755;

  const trainingTargets = computeBaseTargets({ objective, tdee, weightKg, isTrainingDay: true });
  const restTargets = computeBaseTargets({ objective, tdee, weightKg, isTrainingDay: false });

  const inputClass = "w-full max-w-[200px] rounded-[var(--radius-sm)] border border-[var(--color-border)] dark:border-white/10 bg-transparent px-3 py-2 text-sm text-[var(--color-heading)] dark:text-white outline-none focus:border-[var(--color-brand-purple)] tabular-nums";

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {NUTRITION_ENABLED && (
      <Section title="Objectifs nutrition">
        <div className="space-y-3">
          <div className="text-xs text-[var(--color-body)] space-y-2">
            <p className="font-medium text-[var(--color-heading)] dark:text-white">
              Calculés automatiquement depuis ton profil et objectif
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[var(--radius-md)] bg-[var(--color-border)]/30 dark:bg-white/5 p-3 space-y-1.5">
                <p className="font-medium text-[var(--color-heading)] dark:text-white text-[11px] uppercase tracking-wide">
                  🏋️ Jour training
                </p>
                <p className="tabular-nums">{trainingTargets.calories} kcal <span className="opacity-60">({objCfg.trainingDelta >= 0 ? "+" : ""}{objCfg.trainingDelta})</span></p>
                <p className="tabular-nums">P {trainingTargets.proteines_g}g · C {trainingTargets.glucides_g}g · L {trainingTargets.lipides_g}g</p>
              </div>
              <div className="rounded-[var(--radius-md)] bg-[var(--color-border)]/30 dark:bg-white/5 p-3 space-y-1.5">
                <p className="font-medium text-[var(--color-heading)] dark:text-white text-[11px] uppercase tracking-wide">
                  😴 Jour repos
                </p>
                <p className="tabular-nums">{restTargets.calories} kcal <span className="opacity-60">({objCfg.restDelta >= 0 ? "+" : ""}{objCfg.restDelta})</span></p>
                <p className="tabular-nums">P {restTargets.proteines_g}g · C {restTargets.glucides_g}g · L {restTargets.lipides_g}g</p>
              </div>
            </div>
            {config.bmr_kcal && config.tdee_kcal && (
              <p className="opacity-70">BMR : {config.bmr_kcal} kcal · TDEE : {config.tdee_kcal} kcal · Poids : {weightKg} kg</p>
            )}
          </div>
        </div>
      </Section>
      )}

      <Section title="Objectif de sommeil">
        <Field label="Durée visée" help="Sert à la qualité de la nuit, à la tuile Sommeil et aux statistiques.">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={4}
              max={12}
              value={sleepH}
              onChange={(e) =>
                setConfig({
                  ...config,
                  sleep_target_min: +e.target.value * 60 + sleepM,
                })
              }
              className="w-20 rounded-[var(--radius-sm)] border border-[var(--color-border)] dark:border-white/10 bg-transparent px-3 py-2 text-sm text-[var(--color-heading)] dark:text-white outline-none focus:border-[var(--color-brand-purple)] tabular-nums"
            />
            <span className="text-sm text-[var(--color-body)]">h</span>
            <input
              type="number"
              min={0}
              max={59}
              step={15}
              value={sleepM}
              onChange={(e) =>
                setConfig({
                  ...config,
                  sleep_target_min: sleepH * 60 + +e.target.value,
                })
              }
              className="w-20 rounded-[var(--radius-sm)] border border-[var(--color-border)] dark:border-white/10 bg-transparent px-3 py-2 text-sm text-[var(--color-heading)] dark:text-white outline-none focus:border-[var(--color-brand-purple)] tabular-nums"
            />
            <span className="text-sm text-[var(--color-body)]">min</span>
          </div>
        </Field>
      </Section>

      <Section title="Profil">
        <Field label="Âge" help="Donne ta FC max (formule de Tanaka), donc tes zones cardio et ta charge.">
          <input
            type="number"
            min={10}
            max={100}
            value={config.user_age ?? ""}
            onChange={(e) =>
              setConfig({ ...config, user_age: e.target.value ? +e.target.value : null })
            }
            placeholder="—"
            className={inputClass}
          />
        </Field>

        <Field label="Sexe" help="Contexte pour l'IA.">
          <select
            value={config.user_sex ?? ""}
            onChange={(e) =>
              setConfig({ ...config, user_sex: e.target.value || null })
            }
            className={inputClass}
          >
            <option value="">—</option>
            <option value="homme">Homme</option>
            <option value="femme">Femme</option>
          </select>
        </Field>

        <Field label="Taille (cm)" help="Contexte pour l'IA.">
          <input
            type="number"
            min={100}
            max={250}
            value={config.user_height_cm ?? ""}
            onChange={(e) =>
              setConfig({ ...config, user_height_cm: e.target.value ? +e.target.value : null })
            }
            placeholder="—"
            className={inputClass}
          />
        </Field>

        <Field label="Objectif" help="Verdict de composition corporelle et conseils de l'IA.">
          <select
            value={config.user_objective ?? ""}
            onChange={(e) =>
              setConfig({ ...config, user_objective: e.target.value || null })
            }
            className={inputClass}
          >
            <option value="">—</option>
            <option value="lean_bulk">Prise de masse sèche</option>
            <option value="maintenance">Maintien</option>
            <option value="cut">Sèche</option>
            <option value="recomposition">Recomposition</option>
          </select>
        </Field>

        <Field label="Activité principale" help="Contexte pour l'IA.">
          <input
            type="text"
            value={config.user_activity ?? ""}
            onChange={(e) =>
              setConfig({ ...config, user_activity: e.target.value || null })
            }
            placeholder="Ex : surf, muscu, course"
            className={inputClass}
          />
        </Field>

        <Field label="Objectifs personnels" help="Texte libre transmis à l'IA (ex. préparer un trip surf en novembre).">
          <textarea
            value={config.user_goals ?? ""}
            onChange={(e) => setConfig({ ...config, user_goals: e.target.value || null })}
            rows={2}
            maxLength={300}
            placeholder="—"
            className={`${inputClass} sm:max-w-[320px] resize-y`}
          />
        </Field>
      </Section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-[var(--radius-sm)] bg-[var(--color-brand-purple)] text-white px-5 py-2 text-sm font-normal hover:bg-[var(--color-brand-purple-hover)] transition-colors disabled:opacity-50"
        >
          {saving ? "Sauvegarde…" : "Sauvegarder"}
        </button>
        {saved && (
          <span className="text-sm text-[#1f7a3a] dark:text-[#6ee7a0]">Enregistré</span>
        )}
        {error && <span className="text-sm text-[#c0271e] dark:text-[#ff8a80]">{error}</span>}
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <h2 className="text-xs font-normal uppercase tracking-wide text-[var(--color-body)] mb-4">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div className="min-w-0">
        <label className="text-sm font-normal text-[var(--color-label)] dark:text-white/80">{label}</label>
        {/* Ce que ce réglage influence */}
        {help && <p className="text-[11px] text-[var(--color-body)] mt-0.5 max-w-[320px]">{help}</p>}
      </div>
      {children}
    </div>
  );
}
