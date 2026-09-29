// Indicateurs du tableau de bord transmis aux IA (tendances, recos, analyses),
// avec les règles de lecture communes : l'IA cite ce que l'écran affiche au
// lieu de refaire ses propres calculs (et d'arriver à d'autres conclusions).

import type { DashboardSnapshot } from "@/lib/dashboard-data";
import { recoveryColor } from "@/lib/recovery-score";
import { BODY_METRICS_BY_KEY, SPO2_ALERT, SPO2_NORMAL_FROM, formatMetric, isFavorable } from "@/lib/body-metrics";
import { heartRateRecoveryDrop, type RecoveryPoint } from "@/lib/workout-details";
import { normalizeWorkoutType } from "@/lib/workout-types";
import { dateInTz } from "@/lib/dates";
import { formatClock } from "@/lib/sleep";

export const INDICATOR_RULES = `- INDICATEURS : "indicators" contient exactement ce que l'utilisateur voit sur son tableau de bord (récupération, strain,
  équilibre de charge, forme, mesures de la nuit, sommeil). C'est la vérité : NE recalcule RIEN, ne contredis
  JAMAIS un statut ou un libellé. Cite les valeurs telles quelles (ex : "ratio 1,45", "forme −19").
- Mesures de la nuit (FC de sommeil, HRV, température, respiration, SpO2) : compare TOUJOURS à la plage habituelle
  fournie (moyenne ± écart-type sur 60 nuits), jamais à une moyenne 7 j que tu calculerais. Statut "dans la plage" = normal,
  même si la valeur a bougé depuis la veille. Hors plage : "favorable" dit si c'est dans le bon sens.
  SpO2 : sous ${SPO2_NORMAL_FROM} % c'est inhabituel quelle que soit la plage ; sous ${SPO2_ALERT} %, à signaler comme alerte.
- Charge d'entraînement : strain (0-10) pour la journée, loadBalance (charge 7 j vs 42 j) pour la tendance, form
  (charge 42 j − 7 j) pour la fraîcheur. Une forme négative pendant un bloc d'entraînement est normale ("optimal" de −30 à −10).
  NE recalcule JAMAIS de moyenne de charge depuis dailyMetrics.
- FC : la récupération utilise la FC pendant le sommeil (bodyMetrics sleeping_hr), pas la FC repos Apple, qui monte après
  une séance. N'utilise pas resting_hr_bpm comme signal de fatigue.
- SOMMEIL : indicators.sleep est la vérité (score /100 de la nuit : durée vs besoin 50, régularité du coucher 30,
  interruptions 20 ; dette sur 14 nuits ; régularité "sri" 0-100). Cite ces valeurs, ne recalcule rien.
  Phases : la montre sous-estime le sommeil profond (25 à 40 min) et n'en reconnaît qu'environ la moitié ; ses minutes ne
  dépendent presque pas de la durée de la nuit, donc son POURCENTAGE baisse mécaniquement sur une longue nuit.
  JAMAIS de jugement du profond en % ni face à une norme de laboratoire : seulement deepMin face à deepUsualRange
  (plage de l'utilisateur). REM : repère 20 % de la nuit (norme 20-25 %), il se loge en fin de nuit (une nuit écourtée le coupe).
  Nuit "incomplete" (moins de 3 h enregistrées, montre retirée) : ne commente pas sa durée ni ses phases.
  Régularité : sri ≥ 81 bon (médiane de 61 000 personnes), < 72 irrégulier ; elle prédit la santé mieux que la durée.
- Séances : indicators.todayWorkouts donne charge cardio, FC moyenne et hrDrop1min (baisse de FC 1 min après la fin de la
  séance). Ne juge PAS hrDrop1min dans l'absolu : après un surf, l'utilisateur sort de l'eau en marchant, la baisse est
  faible par nature. Ne l'utilise que comparée à d'autres séances du même sport.`;

const RECOVERY_LABEL = { green: "bonne", yellow: "moyenne", red: "faible", gray: "inconnue" } as const;
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
      // Le composant FC porte le nom de la FC réellement utilisée
      components: {
        hrv: comp(c.hrv),
        [r.hrSource === "sleeping" ? "sleepingHr" : "restingHr"]: comp(c.restingHr),
        sleep: comp(c.sleep),
        respiration: comp(c.respiratory),
      },
    },
    sleep: sleepIndicators(snap),
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


// Sommeil tel qu'affiché (page Sommeil, tuile de l'accueil) : lib/sleep
function sleepIndicators(snap: DashboardSnapshot) {
  const s = snap.sleep;
  const sc = s.score;
  const p = s.phases;
  const min = (v: number | null | undefined) => (v != null ? Math.round(v) : null);
  return {
    needMin: snap.sleepTargetMin,
    incomplete: s.incomplete,
    score: sc ? { value: sc.score, label: sc.label, weakest: sc.weakest } : null,
    durationMin: p ? min(p.totalMin) : null,
    bedtime: s.window ? formatClock(s.window.bed) : null,
    wakeTime: s.window ? formatClock(s.window.wake) : null,
    usualBedtime: sc?.regularity.usualBed != null ? formatClock(sc.regularity.usualBed) : null,
    bedtimeDeviationMin: sc?.regularity.deviationMin ?? null,
    deepMin: min(p?.deepMin),
    deepUsualRange: s.deepRange ? `${Math.round(s.deepRange.low)}-${Math.round(s.deepRange.high)} min` : null,
    remMin: min(p?.remMin),
    remPct: p?.remPct != null ? Math.round(p.remPct) : null,
    awakeMin: min(p?.awakeMin),
    napMinYesterday: s.napMinYesterday || null,
    debt14dMin: s.debt.debtMin,
    sri14d: s.sri,
    suggestedBedtime: s.suggestedBed != null ? formatClock(s.suggestedBed) : null,
  };
}
