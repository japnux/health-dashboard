// Indicateurs du tableau de bord transmis aux IA (tendances, recos, analyses),
// avec les règles de lecture communes : l'IA cite ce que l'écran affiche au
// lieu de refaire ses propres calculs (et d'arriver à d'autres conclusions).

import type { DashboardSnapshot } from "@/lib/dashboard-data";
import { recoveryColor } from "@/lib/recovery-score";
import { BODY_METRICS_BY_KEY, formatMetric, isFavorable } from "@/lib/body-metrics";
import { heartRateRecoveryDrop, type RecoveryPoint } from "@/lib/workout-details";
import { normalizeWorkoutType } from "@/lib/workout-types";
import { dateInTz } from "@/lib/dates";

export const INDICATOR_RULES = `- INDICATEURS : "indicators" contient exactement ce que l'utilisateur voit sur son tableau de bord (récupération, strain,
  équilibre de charge, forme, mesures de la nuit, qualité du sommeil). C'est la vérité : NE recalcule RIEN, ne contredis
  JAMAIS un statut ou un libellé. Cite les valeurs telles quelles (ex : "ratio 1,45", "forme −19").
- Mesures de la nuit (FC de sommeil, HRV, température, respiration, SpO2) : compare TOUJOURS à la plage habituelle
  fournie (moyenne ± écart-type sur 60 nuits), jamais à une moyenne 7 j que tu calculerais. Statut "dans la plage" = normal,
  même si la valeur a bougé depuis la veille. Hors plage : "favorable" dit si c'est dans le bon sens.
  SpO2 : sous 95 % c'est inhabituel quelle que soit la plage ; sous 93 %, à signaler comme alerte.
- Charge d'entraînement : strain (0-10) pour la journée, loadBalance (charge 7 j vs 42 j) pour la tendance, form
  (charge 42 j − 7 j) pour la fraîcheur. Une forme négative pendant un bloc d'entraînement est normale ("optimal" de −30 à −10).
  NE recalcule JAMAIS de moyenne de charge depuis dailyMetrics.
- FC : la récupération utilise la FC pendant le sommeil (bodyMetrics sleeping_hr), pas la FC repos Apple, qui monte après
  une séance. N'utilise pas resting_hr_bpm comme signal de fatigue.
- Séances : indicators.todayWorkouts donne charge cardio, FC moyenne et hrDrop1min (baisse de FC 1 min après la fin de la
  séance). Ne juge PAS hrDrop1min dans l'absolu : après un surf, l'utilisateur sort de l'eau en marchant, la baisse est
  faible par nature. Ne l'utilise que comparée à d'autres séances du même sport.`;

const RECOVERY_LABEL = { green: "bonne", yellow: "moyenne", red: "faible", gray: "inconnue" } as const;
const SLEEP_QUALITY: Record<number, string> = { 10: "Excellent", 7: "Bon", 4: "Moyen", 1: "Insuffisant" };
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Indicateurs tels qu'affichés sur l'accueil : l'IA ne doit pas les recalculer. */
export function dashboardIndicators(snap: DashboardSnapshot, workouts: { started_at: string; type: string | null; duration_min: number | null; avg_hr_bpm: number | null; cardio_load: number | null; hr_recovery: unknown }[]) {
  const r = snap.recovery;
  const c = r.components;
  const comp = (x: { available: boolean; score: number }) => (x.available ? round1(x.score) : null);
  return {
    recovery: {
      score: r.score,
      level: RECOVERY_LABEL[recoveryColor(r.score)],
      basis: r.basis,
      // Notes /10 de chaque composant (null = non mesuré)
      components: { hrv: comp(c.hrv), sleepingHr: comp(c.restingHr), sleep: comp(c.sleep), respiration: comp(c.respiratory) },
    },
    sleepQuality: c.sleep.available ? SLEEP_QUALITY[c.sleep.score] ?? null : null,
    strain: { score: snap.strain.score, level: snap.strain.label },
    loadBalance: snap.loadBalance
      ? { ratio: Math.round(snap.loadBalance.ratio * 100) / 100, level: snap.loadBalance.level, label: snap.loadBalance.label }
      : null,
    form: snap.form ? { value: snap.form.value, level: snap.form.level, label: snap.form.label } : null,
    bodyMetrics: snap.bodyMetrics
      .filter((m) => m.value != null)
      .map((m) => {
        const def = BODY_METRICS_BY_KEY.get(m.key)!;
        const fmt = (v: number) => formatMetric(def, v);
        return {
          key: m.key,
          label: def.label,
          value: `${fmt(m.value!)} ${def.unit}`,
          usualRange: m.range ? `${fmt(m.range.low)}-${fmt(m.range.high)} ${def.unit}` : null,
          status:
            m.status == null ? "plage en cours de calcul" : m.status === "in" ? "dans la plage" : m.status === "above" ? "au-dessus de la plage" : "en dessous de la plage",
          favorable: isFavorable(def, m.status),
        };
      }),
    todayWorkouts: workouts
      .filter((w) => dateInTz(w.started_at, snap.tz) === snap.date)
      .map((w) => ({
        type: normalizeWorkoutType(w.type ?? ""),
        durationMin: w.duration_min,
        avgHr: w.avg_hr_bpm,
        cardioLoad: w.cardio_load != null ? Math.round(Number(w.cardio_load)) : null,
        hrDrop1min: heartRateRecoveryDrop(w.hr_recovery as RecoveryPoint[] | null)?.drop1 ?? null,
      })),
  };
}

