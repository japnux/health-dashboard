import { getDashboardSnapshot } from "@/lib/dashboard-data";
import { formatFrLong, dateInTz, diffDaysIso } from "@/lib/dates";
import { workoutDisplayLabel } from "@/lib/workout-types";
import { NutritionTracker } from "@/components/NutritionTracker";
import { JOURNAL_ENABLED, NUTRITION_ENABLED } from "@/lib/features";
import {
  AlertNotice,
  MissingDataNotice,
  StaleScaleNotice,
} from "@/components/Notices";
import { SPO2_ALERT } from "@/lib/body-metrics";
import { JournalDashboard } from "@/components/JournalDashboard";
import { Reservations } from "@/components/Reservations";
import { AiAnalysis } from "@/components/AiAnalysis";
import { AiTrends, AiWorkoutSuggestion } from "@/components/AiInsights";
import { PlannedActivities } from "@/components/PlannedActivities";
import {
  TodayHero,
  WorkoutsToday,
  TrainingBalance,
  BodyMetricsRow,
  SectionTitle,
} from "@/components/home/TodaySections";
import { BodyCompositionTile } from "@/components/body/CompositionBits";

export const dynamic = "force-dynamic";

export default async function Home() {
  const snap = await getDashboardSnapshot();

  const noDataToday = snap.today == null;

  const showStaleScale =
    snap.bodyCompositionAgeDays != null && snap.bodyCompositionAgeDays > 7;

  const spo2Today = snap.today?.spo2_pct ?? null;

  return (
    // Mobile : une colonne, blocs dans l'ordre des "order-*". À partir de md :
    // tableau de bord en deux colonnes (les enveloppes passent de "contents"
    // à de vraies colonnes), pour tout voir sans faire défiler
    <main className="mx-auto max-w-2xl md:max-w-5xl xl:max-w-[1440px] p-4 pb-24 sm:p-6 sm:pb-24 flex flex-col gap-5">
      <header className="pt-3 pb-1">
        <p className="text-xs uppercase tracking-wide text-[var(--color-body)] font-normal">
          Brief du jour
        </p>
        <h1
          className="text-2xl sm:text-[2rem] font-light tracking-tight text-[var(--color-heading)] dark:text-white capitalize"
          style={{ letterSpacing: "-0.64px" }}
        >
          {formatFrLong(snap.date)}
        </h1>
        {snap.lastSyncAt && (
          <p className="text-[11px] text-[var(--color-body)]/50 mt-0.5">
            Dernières données reçues{" "}
            {dateInTz(snap.lastSyncAt, snap.tz) === snap.date
              ? "à "
              : `le ${new Date(snap.lastSyncAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: snap.tz })} à `}
            {new Date(snap.lastSyncAt).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: snap.tz,
            })}
          </p>
        )}
      </header>

      {snap.dataErrors.length > 0 && (
        <AlertNotice
          tone="red"
          title="Certaines données n'ont pas pu être chargées"
        >
          {snap.dataErrors.join(", ")}. Recharge la page ; si ça persiste,
          regarde le journal de synchro dans les réglages.
        </AlertNotice>
      )}
      {noDataToday && <MissingDataNotice />}
      {spo2Today != null && spo2Today < SPO2_ALERT && (
        <AlertNotice
          tone="red"
          title={`SpO₂ à ${String(Math.round(spo2Today * 10) / 10).replace(".", ",")} % cette nuit`}
        >
          Inhabituellement bas (sous {SPO2_ALERT} %). Si ça se répète, parles-en
          à un médecin.
        </AlertNotice>
      )}
      {snap.watch.breathingAlert && (
        <AlertNotice
          tone="orange"
          title="Troubles respiratoires élevés cette nuit"
        >
          {snap.watch.breathingAlert.value} contre{" "}
          {snap.watch.breathingAlert.baseline} habituellement (médiane 30
          nuits). Une nuit isolée n&apos;est pas inquiétante ; si ça se répète,
          regarde Santé &gt; Sommeil ou parles-en à un médecin.
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
            Pense à loguer ton{" "}
            <span className="font-normal text-[var(--color-heading)] dark:text-white">
              journal du jour
            </span>{" "}
            — humeur, énergie, stress.
          </p>
        </div>
      )}

      <div className="contents md:grid md:grid-cols-12 md:gap-6 md:items-start">
        {/* ── Colonne principale : l'état du jour et les mesures (dédoublée en
            deux sous-colonnes sur très grand écran) ── */}
        <div className="contents md:flex md:flex-col md:gap-5 md:col-span-7 xl:col-span-8 xl:grid xl:grid-cols-2 xl:items-start">
          <div className="contents xl:flex xl:flex-col xl:gap-5">
            {/* Récupération, Strain, Sommeil (détail au clic) */}
            <div className="order-1 md:order-none">
              <TodayHero snap={snap} />
            </div>
            {/* Équilibre d'entraînement, mesures de la nuit */}
            <div className="order-4 md:order-none flex flex-col gap-3 empty:hidden">
              <TrainingBalance snap={snap} />
            </div>
          </div>
          <div className="contents xl:flex xl:flex-col xl:gap-5">
            <div className="order-5 md:order-none flex flex-col gap-3 empty:hidden">
              <BodyMetricsRow snap={snap} />
            </div>
            {/* Activité rapide */}
            <div className="order-7 md:order-none">
              <SectionTitle>Activité</SectionTitle>
              <div className="grid grid-cols-3 gap-3 mt-3">
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
                        ? `moy. ${Math.round(snap.weekAvgSteps).toLocaleString("fr-FR")}`
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
                      ? lastWorkoutLabel(
                          snap.lastWorkout.type,
                          snap.lastWorkout.started_at,
                          snap.tz,
                        )
                      : undefined
                  }
                />
              </div>
            </div>
            {/* Composition corporelle (détail au clic) */}
            {snap.composition.weight && (
              <div className="order-8 md:order-none flex flex-col gap-3">
                <SectionTitle>Composition corporelle</SectionTitle>
                <BodyCompositionTile
                  composition={snap.composition}
                  trends={snap.bodyTrends}
                  objective={snap.objective}
                  today={snap.date}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Colonne latérale : quoi faire aujourd'hui ── */}
        <div className="contents md:flex md:flex-col md:gap-5 md:col-span-5 xl:col-span-4">
          {/* Séances du jour (détail au clic) */}
          <div className="order-2 md:order-none flex flex-col gap-3 empty:hidden">
            <WorkoutsToday snap={snap} />
          </div>
          {/* Suggestion de séance + activités prévues (et nutrition si activée) */}
          <div className="order-3 md:order-none grid grid-cols-1 gap-4">
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
              <PlannedActivities
                date={snap.date}
                activities={snap.plannedActivities}
              />
            </AiWorkoutSuggestion>
          </div>
          {/* Tendances et recommandations (IA) */}
          <div className="order-6 md:order-none empty:hidden">
            <AiTrends />
          </div>
        </div>
      </div>

      {/* ── Journal ── */}
      {JOURNAL_ENABLED && (
        <div className="order-9">
          <JournalDashboard date={snap.date} impact={snap.journalImpact} />
        </div>
      )}

      {/* ── Réservations Sportigo ── */}
      <div className="order-10">
        <Reservations />
      </div>

      <div className="order-11 pb-8" />

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
      <div className="text-lg font-light tabular-nums text-[var(--color-heading)] dark:text-white">
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-body)]">
        {label}
      </div>
      {sub && (
        <div className="text-[10px] text-[var(--color-body)] mt-0.5">{sub}</div>
      )}
    </div>
  );
}

// "Surf auj.", "Muscu hier", "Surf il y a 3 j" (jours calendaires du fuseau)
function lastWorkoutLabel(
  type: string | null,
  startedAt: string,
  tz: string,
): string {
  const label = type ? workoutDisplayLabel(type) : "?";
  const daysDiff = diffDaysIso(
    dateInTz(new Date(), tz),
    dateInTz(startedAt, tz),
  );
  if (daysDiff === 0) return `${label} auj.`;
  if (daysDiff === 1) return `${label} hier`;
  return `${label} il y a ${daysDiff} j`;
}
