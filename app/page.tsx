import { getDashboardSnapshot } from "@/lib/dashboard-data";
import { formatFrLong, dateInTz, diffDaysIso } from "@/lib/dates";
import { workoutDisplayLabel } from "@/lib/workout-types";
import { NutritionTracker } from "@/components/NutritionTracker";
import { JOURNAL_ENABLED, NUTRITION_ENABLED } from "@/lib/features";
import { MissingDataNotice, StaleScaleNotice } from "@/components/Notices";
import { JournalDashboard } from "@/components/JournalDashboard";
import { Reservations } from "@/components/Reservations";
import { AiAnalysis } from "@/components/AiAnalysis";
import { AiTrends, AiWorkoutSuggestion } from "@/components/AiInsights";
import { PlannedActivities } from "@/components/PlannedActivities";
import { TodayHero, WorkoutsToday, TrainingBalance, BodyMetricsRow, SleepTile } from "@/components/home/TodaySections";

export const dynamic = "force-dynamic";

export default async function Home() {
  const snap = await getDashboardSnapshot();

  const noDataToday = snap.today == null;

  const showStaleScale =
    snap.bodyCompositionAgeDays != null && snap.bodyCompositionAgeDays > 7;

  const spo2Today = snap.today?.spo2_pct ?? null;


  return (
    <main className="mx-auto max-w-2xl p-4 pb-24 sm:p-6 sm:pb-24 space-y-5">
      <header className="pt-3 pb-1">
        <p className="text-xs uppercase tracking-wide text-[var(--color-body)] font-normal">
          Brief du jour
        </p>
        <h1 className="text-2xl sm:text-[2rem] font-light tracking-tight text-[var(--color-heading)] dark:text-white capitalize" style={{ letterSpacing: "-0.64px" }}>
          {formatFrLong(snap.date)}
        </h1>
        {snap.lastSyncAt && (
          <p className="text-[11px] text-[var(--color-body)]/50 mt-0.5">
            Dernières données reçues{" "}
            {dateInTz(snap.lastSyncAt, snap.tz) === snap.date
              ? "à "
              : `le ${new Date(snap.lastSyncAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: snap.tz })} à `}
            {new Date(snap.lastSyncAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: snap.tz })}
          </p>
        )}
      </header>

      {noDataToday && <MissingDataNotice />}
      {spo2Today != null && spo2Today < 94 && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[#ea2261]/10 border border-[#ea2261]/20 px-3 py-2">
          <span className="text-sm">🫁</span>
          <p className="text-xs text-[#ea2261]">
            SpO₂ à <span className="font-normal">{Math.round(spo2Today * 10) / 10}%</span> — inhabituellement bas. Si ça persiste, consulte un médecin.
          </p>
        </div>
      )}
      {snap.watch.breathingAlert && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[#f97316]/10 border border-[#f97316]/20 px-3 py-2">
          <span className="text-sm">🫁</span>
          <p className="text-xs text-[#c2410c]">
            Troubles respiratoires élevés cette nuit :{" "}
            <span className="font-normal">{snap.watch.breathingAlert.value}</span> contre{" "}
            {snap.watch.breathingAlert.baseline} habituellement (médiane 30 nuits). Une nuit isolée n&apos;est pas
            inquiétante ; si ça se répète, regarde Santé → Sommeil ou parles-en à un médecin.
          </p>
        </div>
      )}
      {showStaleScale && (
        <StaleScaleNotice ageDays={snap.bodyCompositionAgeDays!} />
      )}

      {/* Alerte journal */}
      {JOURNAL_ENABLED && !snap.hasJournalToday && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-brand-purple)]/5 border border-[var(--color-brand-purple)]/15 px-3 py-2">
          <span className="text-sm">📝</span>
          <p className="text-xs text-[var(--color-body)]">
            Pense à loguer ton <span className="font-normal text-[var(--color-heading)] dark:text-white">journal du jour</span> — humeur, énergie, stress.
          </p>
        </div>
      )}

      {/* ── Aujourd'hui : récupération, Strain et quoi faire (détail au clic) ── */}
      <TodayHero snap={snap} />

      {/* ── Séances du jour (détail au clic) ── */}
      <WorkoutsToday snap={snap} />

      {/* ── Nutrition + Suggestion Workout — côte à côte ── */}
      <div
        className={`grid grid-cols-1 gap-4 ${NUTRITION_ENABLED ? "sm:grid-cols-2" : ""}`}
      >
        {NUTRITION_ENABLED && (
          <NutritionTracker
            date={snap.date}
            macros={snap.macrosToday}
            targets={snap.macrosTargets}
            proteinFromLogs={snap.proteinTotalToday}
            adjustedTargets={snap.adjustedTargets}
            estimatedRemainingKcal={snap.estimatedRemainingKcal}
            activeSlot={snap.activeSlot}
          />
        )}
        <AiWorkoutSuggestion>
          <PlannedActivities date={snap.date} activities={snap.plannedActivities} />
        </AiWorkoutSuggestion>
      </div>

      {/* ── Équilibre d'entraînement, mesures de la nuit, sommeil (détail au clic) ── */}
      <TrainingBalance snap={snap} />
      <BodyMetricsRow snap={snap} />
      <SleepTile snap={snap} />

      {/* ── Tendances & Signaux (IA) + Score semaine ── */}
      <AiTrends />

      {/* ── Activité rapide ── */}
      <div>
        <p className="text-xs uppercase tracking-wide text-[var(--color-body)] font-normal mb-2">
          Activité
        </p>
        <div className="grid grid-cols-3 gap-3">
          <QuickStat
            icon="👟"
            label="Pas"
            value={
              snap.today?.steps != null
                ? snap.today.steps.toLocaleString("fr-FR")
                : "—"
            }
            sub={
              snap.yesterdayMetrics?.steps != null
                ? `hier ${snap.yesterdayMetrics.steps.toLocaleString("fr-FR")}`
                : snap.weekAvgSteps != null
                  ? `moy ${(snap.weekAvgSteps / 1000).toFixed(1)}k`
                  : undefined
            }
          />
          <QuickStat
            icon="🔥"
            label="Kcal actives"
            value={
              snap.today?.active_kcal != null
                ? `${snap.today.active_kcal}`
                : "—"
            }
            sub={
              snap.yesterdayMetrics?.active_kcal != null
                ? `hier ${snap.yesterdayMetrics.active_kcal}`
                : undefined
            }
          />
          <QuickStat
            icon="💪"
            label="Séances 7j"
            value={`${snap.weekWorkoutCount}`}
            sub={
              snap.lastWorkout
                ? lastWorkoutLabel(snap.lastWorkout.type, snap.lastWorkout.started_at, snap.tz)
                : undefined
            }
          />
        </div>
      </div>

      {/* ── Body Composition ── */}
      {snap.lastBodyComposition &&
        snap.bodyCompositionAgeDays != null &&
        snap.bodyCompositionAgeDays <= 14 && (
          <Card>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-xs uppercase tracking-wide text-[var(--color-body)] font-normal">
                Composition corporelle
              </h2>
              <span className="text-[10px] text-[var(--color-body)]/60 tabular-nums capitalize">
                {new Date(snap.lastBodyComposition.measured_at).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
              </span>
            </div>
            <BodyCompositionCard
              current={snap.lastBodyComposition}
              previous={snap.prevBodyComposition}
              trends={snap.bodyTrends}
            />
          </Card>
        )}

      {/* ── Journal ── */}
      {JOURNAL_ENABLED && <JournalDashboard date={snap.date} impact={snap.journalImpact} />}

      {/* ── Réservations Sportigo ── */}
      <Reservations />

      <div className="pb-8" />

      {/* Chatbox IA flottante */}
      <AiAnalysis />
    </main>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      {children}
    </section>
  );
}

function QuickStat({
  icon,
  label,
  value,
  sub,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-4 text-center"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-lg font-light tabular-nums text-[var(--color-heading)] dark:text-white">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-body)]">
        {label}
      </div>
      {sub && (
        <div className="text-[10px] text-[var(--color-body)] mt-0.5">{sub}</div>
      )}
    </div>
  );
}

type BodyCompRow = {
  measured_at: string;
  weight_kg: number;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
};

function bodyAnalysis(current: BodyCompRow, previous: BodyCompRow): string | null {
  const weightDiff = +(current.weight_kg - previous.weight_kg).toFixed(1);
  // Période de la comparaison, sinon "+1.3 kg" ne dit pas depuis quand
  const gapDays = diffDaysIso(current.measured_at.slice(0, 10), previous.measured_at.slice(0, 10));
  const since = `en ${gapDays} j`;
  const hasFat = current.body_fat_pct != null && previous.body_fat_pct != null;
  const hasLean = current.lean_mass_kg != null && previous.lean_mass_kg != null;

  if (!hasFat && !hasLean) {
    if (Math.abs(weightDiff) < 0.3) return "Poids stable — continue à tracker pour voir la tendance.";
    return weightDiff > 0
      ? `+${weightDiff} kg ${since} — pèse-toi avec la balance impédancemètre pour voir la répartition.`
      : `${weightDiff} kg ${since} — pèse-toi avec la balance impédancemètre pour voir la répartition.`;
  }

  const fatDiff = hasFat ? +(current.body_fat_pct! - previous.body_fat_pct!).toFixed(1) : 0;
  const leanDiff = hasLean ? +(current.lean_mass_kg! - previous.lean_mass_kg!).toFixed(1) : 0;

  if (Math.abs(weightDiff) < 0.3 && Math.abs(fatDiff) < 0.5) return "Composition stable — bonne constance.";
  if (leanDiff > 0.2 && fatDiff < -0.3) return "🎯 Recomposition en cours — tu gagnes du muscle et perds du gras.";
  if (leanDiff > 0.2 && fatDiff <= 0.3) return "💪 Prise de masse musculaire — le surplus calorique est bien utilisé.";
  if (fatDiff < -0.5 && leanDiff >= -0.2) return "Sèche efficace — perte de gras avec maintien musculaire.";
  if (fatDiff > 0.5 && leanDiff <= 0) return "⚠️ Prise de gras sans gain musculaire — ajuster les apports ou l'entraînement.";
  if (weightDiff < -0.5 && leanDiff < -0.3) return "⚠️ Perte de muscle — vérifier les apports protéiques et le volume d'entraînement.";
  if (weightDiff > 1.5) return "Prise de poids rapide — probablement de la rétention d'eau, à confirmer sur les prochains jours.";
  if (weightDiff > 0.5 && leanDiff > 0) return `+${leanDiff} kg maigre — la prise de poids est en partie musculaire.`;
  return "Évolution modérée — à surveiller sur la tendance.";
}

// Couleur d'une tendance selon l'objectif "recomp + prise de masse maigre" :
//   - poids : flat/légère hausse OK (gain de muscle), grosse hausse orange, baisse OK aussi
//   - fat   : baisse = vert, flat = neutre, hausse = rouge
//   - lean  : hausse = vert, flat = neutre, baisse = rouge
type TrendKind = "weight" | "fat" | "lean";
function trendColor(kind: TrendKind, slope: number): string {
  const abs = Math.abs(slope);
  if (abs < 0.05) return "text-[var(--color-body)]"; // flat
  if (kind === "fat") return slope < 0 ? "text-[#108c3d]" : "text-[#ea2261]";
  if (kind === "lean") return slope > 0 ? "text-[#108c3d]" : "text-[#ea2261]";
  // weight pour recomp : baisse douce ou hausse douce = vert ; >0.3 kg/sem hausse = orange
  if (slope < 0) return "text-[#108c3d]";
  if (slope > 0.3) return "text-[#c97a1a]";
  return "text-[#108c3d]";
}

function trendArrow(direction: "down" | "up" | "flat"): string {
  if (direction === "down") return "↘";
  if (direction === "up") return "↗";
  return "→";
}

function formatSlope(slope: number, unit: string): string {
  // 2 décimales pour kg, 1 décimale pour %.
  const dec = unit === "%" ? 1 : 2;
  const sign = slope > 0 ? "+" : slope < 0 ? "" : "";
  return `${sign}${slope.toFixed(dec)}${unit}/sem`;
}

function TrendLine({
  kind,
  unit,
  trend,
}: {
  kind: TrendKind;
  unit: string;
  trend: import("@/lib/body-trend").BodyTrend | null;
}) {
  if (!trend) {
    return (
      <div className="text-[10px] text-[var(--color-body)]/60 mt-0.5">—</div>
    );
  }
  return (
    <div
      className={`text-[10px] tabular-nums font-normal mt-0.5 ${trendColor(kind, trend.slopePerWeek)}`}
      title={`${trend.samples} mesures · R² ${trend.r2.toFixed(2)} · sur ${trend.windowDays}j`}
    >
      {trendArrow(trend.direction)} {formatSlope(trend.slopePerWeek, unit)}
    </div>
  );
}

function BodyCompositionCard({
  current,
  previous,
  trends,
}: {
  current: BodyCompRow;
  previous: BodyCompRow | null;
  trends: {
    weight: import("@/lib/body-trend").BodyTrend | null;
    fat: import("@/lib/body-trend").BodyTrend | null;
    lean: import("@/lib/body-trend").BodyTrend | null;
  };
}) {
  const analysis = previous ? bodyAnalysis(current, previous) : null;
  const windowDays =
    trends.weight?.windowDays ?? trends.fat?.windowDays ?? trends.lean?.windowDays ?? null;
  const samples = Math.max(
    trends.weight?.samples ?? 0,
    trends.fat?.samples ?? 0,
    trends.lean?.samples ?? 0,
  );

  return (
    <div>
      {windowDays != null && samples > 0 && (
        <p className="text-[10px] text-[var(--color-body)] mb-3 text-right">
          tendance {windowDays}j · {samples} mesure{samples > 1 ? "s" : ""}
        </p>
      )}
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-light tabular-nums text-[var(--color-heading)] dark:text-white">
            {current.weight_kg}
          </div>
          <div className="text-xs text-[var(--color-body)]">kg</div>
          <TrendLine kind="weight" unit=" kg" trend={trends.weight} />
        </div>
        {current.body_fat_pct != null && (
          <div>
            <div className="text-2xl font-light tabular-nums text-[var(--color-heading)] dark:text-white">
              {current.body_fat_pct}%
            </div>
            <div className="text-xs text-[var(--color-body)]">masse grasse</div>
            <TrendLine kind="fat" unit="%" trend={trends.fat} />
          </div>
        )}
        {current.lean_mass_kg != null && (
          <div>
            <div className="text-2xl font-light tabular-nums text-[var(--color-heading)] dark:text-white">
              {current.lean_mass_kg}
            </div>
            <div className="text-xs text-[var(--color-body)]">kg maigre</div>
            <TrendLine kind="lean" unit=" kg" trend={trends.lean} />
          </div>
        )}
      </div>
      {analysis && (
        <p className="text-xs text-[var(--color-body)] mt-3 pt-3 border-t border-[var(--color-border)] dark:border-white/10">
          {analysis}
        </p>
      )}
    </div>
  );
}

function lastWorkoutLabel(type: string | null, startedAt: string, tz: string): string {
  const typeMap: Record<string, string> = {
    SurfingSports: "Surf",
    FunctionalStrengthTraining: "Muscu",
    "Entraînement de Force Fonctionnelle": "Muscu",
    "Functional Strength Training": "Muscu",
    Running: "Course",
    "Outdoor Run": "Course",
    "Extérieur Course": "Course",
    Swimming: "Natation",
    Hiking: "Rando",
    Walking: "Marche",
    Cycling: "Vélo",
  };
  const cleanType = type ? (typeMap[type] ?? workoutDisplayLabel(type)) : "?";
  // Écart en jours calendaires (heure de Paris), pas en tranches de 24 h :
  // une séance d'hier 23h vue ce matin à 8h est bien "hier"
  const daysDiff = diffDaysIso(dateInTz(new Date(), tz), dateInTz(startedAt, tz));
  if (daysDiff === 0) return `${cleanType} auj.`;
  if (daysDiff === 1) return `${cleanType} hier`;
  return `${cleanType} il y a ${daysDiff}j`;
}
