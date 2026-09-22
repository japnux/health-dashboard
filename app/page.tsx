import { getDashboardSnapshot } from "@/lib/dashboard-data";
import { formatFrLong, dateInTz, diffDaysIso } from "@/lib/dates";
import { workoutDisplayLabel } from "@/lib/workout-types";
import { NutritionTracker } from "@/components/NutritionTracker";
import { JOURNAL_ENABLED, NUTRITION_ENABLED } from "@/lib/features";
import { AlertNotice, MissingDataNotice, StaleScaleNotice } from "@/components/Notices";
import { SPO2_ALERT } from "@/lib/body-metrics";
import { JournalDashboard } from "@/components/JournalDashboard";
import { Reservations } from "@/components/Reservations";
import { AiAnalysis } from "@/components/AiAnalysis";
import { AiTrends, AiWorkoutSuggestion } from "@/components/AiInsights";
import { PlannedActivities } from "@/components/PlannedActivities";
import { TodayHero, WorkoutsToday, TrainingBalance, BodyMetricsRow, SectionTitle } from "@/components/home/TodaySections";
import { BodyCompositionTile } from "@/components/body/CompositionBits";

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

      {snap.dataErrors.length > 0 && (
        <AlertNotice tone="red" title="Certaines données n'ont pas pu être chargées">
          {snap.dataErrors.join(", ")}. Recharge la page ; si ça persiste, regarde le journal de synchro dans les réglages.
        </AlertNotice>
      )}
      {noDataToday && <MissingDataNotice />}
      {spo2Today != null && spo2Today < SPO2_ALERT && (
        <AlertNotice tone="red" title={`SpO₂ à ${String(Math.round(spo2Today * 10) / 10).replace(".", ",")} % cette nuit`}>
          Inhabituellement bas (sous {SPO2_ALERT} %). Si ça se répète, parles-en à un médecin.
        </AlertNotice>
      )}
      {snap.watch.breathingAlert && (
        <AlertNotice tone="orange" title="Troubles respiratoires élevés cette nuit">
          {snap.watch.breathingAlert.value} contre {snap.watch.breathingAlert.baseline} habituellement (médiane 30 nuits). Une
          nuit isolée n&apos;est pas inquiétante ; si ça se répète, regarde Santé &gt; Sommeil ou parles-en à un médecin.
        </AlertNotice>
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

      {/* ── Composition corporelle : tuile vers la page de détail ── */}
      {snap.composition.weight && (
        <>
          <SectionTitle>Composition corporelle</SectionTitle>
          <BodyCompositionTile
            composition={snap.composition}
            trends={snap.bodyTrends}
            objective={snap.objective}
            today={snap.date}
          />
        </>
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
