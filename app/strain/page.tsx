// Page de détail du Strain : effort de la journée (séances et activité hors
// séances) comparé à ta moyenne, et historique jour par jour.

import Link from "next/link";
import { getDashboardSnapshot } from "@/lib/dashboard-data";
import { createServiceClient } from "@/lib/supabase/service";
import { dateInTz, isoDateMinusDays } from "@/lib/dates";
import { computeDayStrain, strainColor, type StrainResult } from "@/lib/strain-score";
import { normalizeWorkoutType, workoutDisplayLabel, workoutEmoji } from "@/lib/workout-types";
import { sportColor } from "@/lib/palette";
import { ZonedLineChart } from "@/components/charts/ZonedLineChart";
import {
  BackLink,
  DetailCard,
  DetailHeader,
  DetailPage,
  PeriodSwitch,
  StatGrid,
  formatLongDate,
  parsePeriod,
} from "@/components/detail/DetailBits";

export const dynamic = "force-dynamic";

const ADVICE: Record<StrainResult["level"], string> = {
  light: "Journée légère : ton corps récupère. Si ta récupération est bonne, tu as de la marge pour t'entraîner.",
  moderate: "Journée d'entraînement standard, autour de ta moyenne ou en dessous.",
  high: "Grosse journée, au-dessus de ta moyenne. Soigne la récupération ce soir : repas, hydratation, sommeil.",
  very_high: "Journée exceptionnelle, au moins deux fois ta charge habituelle. Repas, hydratation et sommeil en priorité.",
};

const fmt1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ","));

export default async function StrainPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const period = parsePeriod((await searchParams).p, [7, 30, 90], 30);
  const snap = await getDashboardSnapshot();
  const strain = snap.strain;
  const supabase = createServiceClient();

  // Historique : chaque jour comparé à ses 30 jours précédents, comme l'accueil
  const from = isoDateMinusDays(snap.date, period + 30);
  const [{ data: rows }, { data: workouts }] = await Promise.all([
    supabase
      .from("daily_metrics")
      .select("date, active_kcal, cardio_load")
      .gte("date", from)
      .lte("date", snap.date)
      .order("date", { ascending: true }),
    supabase
      .from("workouts")
      .select("id, started_at, type, duration_min, cardio_load, kcal")
      .gte("started_at", isoDateMinusDays(snap.date, 2))
      .order("started_at", { ascending: true }),
  ]);
  const all = rows ?? [];
  const periodStart = isoDateMinusDays(snap.date, period - 1);
  const history = all
    .filter((d) => d.date >= periodStart && (d.cardio_load != null || (d.active_kcal ?? 0) > 0))
    .map((d) => {
      const past = all.filter((p) => p.date < d.date && p.date >= isoDateMinusDays(d.date, 30));
      const s = computeDayStrain({ active_kcal: d.active_kcal, cardio_load: d.cardio_load }, past);
      return { date: d.date, value: s.score, load: s.cardioLoad ?? undefined };
    });

  // Composition de la journée : séances + activité hors séances
  const hr = strain.mode === "hr";
  const todayWorkouts = (workouts ?? []).filter((w) => dateInTz(w.started_at, snap.tz) === snap.date);
  const dayTotal = hr ? (strain.cardioLoad ?? 0) : strain.activeKcalToday;
  const workoutValue = (w: (typeof todayWorkouts)[number]) => (hr ? Number(w.cardio_load ?? 0) : Number(w.kcal ?? 0));
  const workoutsSum = todayWorkouts.reduce((a, w) => a + workoutValue(w), 0);
  const background = Math.max(0, dayTotal - workoutsSum);
  const ratio = strain.hasBaseline && strain.baselineAvg > 0 ? dayTotal / strain.baselineAvg : null;
  const unit = hr ? "" : " kcal";
  const share = (v: number) => (dayTotal > 0 ? Math.round((v / dayTotal) * 100) : 0);

  const scores = history.map((h) => h.value);
  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  return (
    <DetailPage>
      <BackLink />
      <DetailHeader
        eyebrow="Strain"
        value={fmt1(strain.score)}
        unit="/10"
        status={{ color: strainColor(strain.score), label: strain.label }}
        date={`${formatLongDate(snap.date)} · se met à jour pendant la journée`}
        advice={ADVICE[strain.level]}
      />

      <DetailCard title="Ta journée">
        <StatGrid
          items={[
            { label: hr ? "Charge cardio" : "Énergie active", value: `${Math.round(dayTotal)}${unit}` },
            {
              label: "Ta moyenne",
              value: strain.hasBaseline ? `${strain.baselineAvg}${unit}` : "—",
              sub: "jours actifs, 30 j",
            },
            { label: "Rapport", value: ratio != null ? `${ratio.toFixed(1).replace(".", ",")}×` : "—", sub: "ta moyenne" },
          ]}
        />

        {dayTotal > 0 && (
          <div className="mt-5 pt-5 border-t border-black/5 dark:border-white/10 space-y-3">
            {todayWorkouts.map((w) => {
              const v = workoutValue(w);
              return (
                <Link key={w.id} href={`/seance/${w.id}`} className="flex items-center gap-3 text-sm group">
                  <span className="w-5 text-center" aria-hidden>
                    {workoutEmoji(w.type ?? "")}
                  </span>
                  <span className="w-28 sm:w-36 shrink-0 text-[var(--color-heading)] dark:text-white group-hover:underline truncate">
                    {workoutDisplayLabel(w.type ?? "Séance")}{" "}
                    <span className="text-[var(--color-body)]">
                      {new Date(w.started_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: snap.tz })}
                    </span>
                  </span>
                  <div className="flex-1 h-2.5 rounded-full bar-track overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${share(v)}%`, backgroundColor: sportColor(normalizeWorkoutType(w.type ?? "")) }}
                    />
                  </div>
                  <span className="w-16 text-right tabular-nums text-[var(--color-body)]">
                    {Math.round(v)}
                    {unit}
                  </span>
                </Link>
              );
            })}
            <div className="flex items-center gap-3 text-sm">
              <span className="w-5 text-center" aria-hidden>
                🚶
              </span>
              <span className="w-28 sm:w-36 shrink-0 text-[var(--color-heading)] dark:text-white">Hors séances</span>
              <div className="flex-1 h-2.5 rounded-full bar-track overflow-hidden">
                <div className="h-full rounded-full bg-[#8e8e93]" style={{ width: `${share(background)}%` }} />
              </div>
              <span className="w-16 text-right tabular-nums text-[var(--color-body)]">
                {Math.round(background)}
                {unit}
              </span>
            </div>
            <p className="text-[11px] text-[var(--color-body)]">
              {hr
                ? "Hors séances : effort mesuré par ta FC le reste de la journée (marche, vélo, escaliers…)."
                : "Pas assez de fréquence cardiaque aujourd'hui : le Strain est calculé sur l'énergie active."}
            </p>
          </div>
        )}
      </DetailCard>

      {history.length > 0 && (
        <DetailCard title="Évolution" right={<PeriodSwitch base="/strain" current={period} />}>
          <ZonedLineChart kind="strain" points={history} />
          {avg != null && (
            <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/10">
              <StatGrid
                items={[
                  { label: "Moyenne", value: fmt1(Math.round(avg * 10) / 10) },
                  { label: "Max", value: fmt1(Math.max(...scores)) },
                  { label: "Jours ≥ 8", value: String(scores.filter((v) => v >= 8).length), sub: `sur ${scores.length}` },
                ]}
              />
            </div>
          )}
        </DetailCard>
      )}

      <DetailCard title="À propos">
        <div className="space-y-3 text-sm text-[var(--color-body)] leading-relaxed">
          <p>
            Le Strain mesure l&apos;effort de ta journée, sur 10. Il compare ta charge cardio du jour (séances et reste de la
            journée) à ta moyenne des jours actifs sur les 30 derniers jours.
          </p>
          <p>
            L&apos;échelle est logarithmique : <span className="text-[var(--color-heading)] dark:text-white">6</span> = une
            journée égale à ta moyenne, <span className="text-[var(--color-heading)] dark:text-white">8</span> = le double,{" "}
            <span className="text-[var(--color-heading)] dark:text-white">10</span> = quatre fois. Monter en haut de
            l&apos;échelle demande de plus en plus d&apos;effort.
          </p>
          <p>
            0 à 3 : léger · 3 à 6 : modéré · 6 à 8 : élevé · 8 à 10 : très élevé. Le Strain dit l&apos;effort du jour ; la
            récupération dit comment ta nuit t&apos;a remis en état. Les deux se lisent ensemble.
          </p>
        </div>
      </DetailCard>
    </DetailPage>
  );
}
