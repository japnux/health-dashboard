import { getDashboardSnapshot } from "@/lib/dashboard-data";
import { formatFrLong } from "@/lib/dates";
import { recoveryColor } from "@/lib/recovery-score";
import { NutritionTracker } from "@/components/NutritionTracker";
import { MissingDataNotice, StaleScaleNotice } from "@/components/Notices";
import { JournalDashboard } from "@/components/JournalDashboard";
import { Reservations } from "@/components/Reservations";
import { AiAnalysis } from "@/components/AiAnalysis";
import { AiTrends, AiWorkoutSuggestion } from "@/components/AiInsights";
import { PlannedActivities } from "@/components/PlannedActivities";
import { StrainGauge } from "@/components/StrainGauge";
import { strainColor as getStrainColor } from "@/lib/strain-score";
import { WorkoutBadges } from "@/components/WorkoutBadges";
import type { StrainResult } from "@/lib/strain-score";

export const dynamic = "force-dynamic";

const recoveryBg: Record<string, string> = {
  green: "from-[#15be53]/15 to-[#15be53]/5 border-[#15be53]/20",
  yellow: "from-[#eab308]/15 to-[#eab308]/5 border-[#eab308]/20",
  red: "from-[#ea2261]/15 to-[#ea2261]/5 border-[#ea2261]/20",
  gray: "from-[var(--color-body)]/10 to-[var(--color-body)]/5 border-[var(--color-border)]",
};

const recoveryText: Record<string, string> = {
  green: "text-[#108c3d]",
  yellow: "text-[#9b6829]",
  red: "text-[#ea2261]",
  gray: "text-[var(--color-body)]",
};

export default async function Home() {
  const snap = await getDashboardSnapshot();

  const color = recoveryColor(snap.recovery.score);
  const scoreText = snap.recovery.score != null ? snap.recovery.score : "—";
  const noDataToday = snap.today == null;

  const showStaleScale =
    snap.bodyCompositionAgeDays != null && snap.bodyCompositionAgeDays > 7;

  const hrvDelta =
    snap.today?.hrv_ms != null && snap.yesterdayMetrics?.hrv_ms != null
      ? snap.today.hrv_ms - snap.yesterdayMetrics.hrv_ms
      : null;
  const effectiveHr = snap.today?.resting_hr_bpm ?? snap.yesterdayMetrics?.resting_hr_bpm ?? null;
  const hrDelta = null;
  const respiDelta =
    snap.today?.respiratory_rate != null && snap.yesterdayMetrics?.respiratory_rate != null
      ? snap.today.respiratory_rate - snap.yesterdayMetrics.respiratory_rate
      : null;
  const spo2Today = snap.today?.spo2_pct ?? null;
  const spo2Yesterday = snap.yesterdayMetrics?.spo2_pct ?? null;

  const sleepH = snap.today?.sleep_total_min
    ? Math.floor(snap.today.sleep_total_min / 60)
    : null;
  const sleepM = snap.today?.sleep_total_min
    ? Math.round(snap.today.sleep_total_min % 60)
    : null;

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6 space-y-5">
      <header className="pt-3 pb-1">
        <p className="text-xs uppercase tracking-wide text-[var(--color-body)] font-normal">
          Brief du jour
        </p>
        <h1 className="text-2xl sm:text-[2rem] font-light tracking-tight text-[var(--color-heading)] dark:text-white capitalize" style={{ letterSpacing: "-0.64px" }}>
          {formatFrLong(snap.date)}
        </h1>
        {snap.lastSyncAt && (
          <p className="text-[11px] text-[var(--color-body)]/50 mt-0.5">
            Dernières données reçues à {new Date(snap.lastSyncAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}
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
      {showStaleScale && (
        <StaleScaleNotice ageDays={snap.bodyCompositionAgeDays!} />
      )}

      {/* Alerte journal */}
      {!snap.hasJournalToday && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-brand-purple)]/5 border border-[var(--color-brand-purple)]/15 px-3 py-2">
          <span className="text-sm">📝</span>
          <p className="text-xs text-[var(--color-body)]">
            Pense à loguer ton <span className="font-normal text-[var(--color-heading)] dark:text-white">journal du jour</span> — humeur, énergie, stress.
          </p>
        </div>
      )}

      {/* ── Recovery + Strain + Sommeil ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {/* Recovery */}
        <section
          className={`relative overflow-hidden rounded-[var(--radius-lg)] border bg-gradient-to-br ${recoveryBg[color]} p-5`}
          style={{ boxShadow: "var(--shadow-ambient)" }}
        >
          <p className="text-xs uppercase tracking-wide text-[var(--color-body)] mb-1 font-normal">
            Récupération
          </p>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-4xl font-light tabular-nums ${recoveryText[color]}`}
            >
              {snap.recovery.score != null ? Math.floor(snap.recovery.score) : "—"}
            </span>
            {snap.recovery.score != null && snap.recovery.score % 1 !== 0 && (
              <span className={`text-xl font-light tabular-nums ${recoveryText[color]}`}>
                .{Math.round((snap.recovery.score % 1) * 10)}
              </span>
            )}
            <span className="text-sm text-[var(--color-body)]">/10</span>
          </div>
          {snap.recovery.basis !== "full" && (
            <p className="text-[10px] text-[var(--color-body)] mt-1">
              Score{" "}
              {snap.recovery.basis === "partial" ? "partiel" : "estimé"}
            </p>
          )}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3 text-sm">
            <MiniMetric
              label="HRV"
              value={
                snap.today?.hrv_ms != null
                  ? `${Math.round(snap.today.hrv_ms)} ms`
                  : "—"
              }
              sub={
                snap.hrvBaselineAvg != null
                  ? `méd ${Math.round(snap.hrvBaselineAvg)}`
                  : undefined
              }
              delta={hrvDelta}
              positiveIsGood
            />
            <MiniMetric
              label="FC repos"
              value={
                effectiveHr != null
                  ? `${effectiveHr} bpm`
                  : "—"
              }
              sub={
                snap.hrBaselineAvg != null
                  ? `moy ${Math.round(snap.hrBaselineAvg)}`
                  : undefined
              }
              delta={hrDelta}
              positiveIsGood={false}
            />
            {snap.today?.respiratory_rate != null && (
              <MiniMetric
                label="Respi"
                value={`${Math.round(snap.today.respiratory_rate * 10) / 10}/min`}
                sub={
                  snap.respiBaselineAvg != null
                    ? `moy ${Math.round(snap.respiBaselineAvg * 10) / 10}`
                    : undefined
                }
                delta={respiDelta}
                positiveIsGood={false}
              />
            )}
            {spo2Today != null && (
              <MiniMetric
                label="SpO₂"
                value={`${Math.round(spo2Today * 10) / 10}%`}
                sub={spo2Yesterday != null ? `hier ${Math.round(spo2Yesterday * 10) / 10}%` : undefined}
                delta={null}
                positiveIsGood
              />
            )}
          </div>
        </section>

        {/* Strain */}
        <StrainCard strain={snap.strain} todayWorkouts={snap.recentWorkouts.filter((w) => w.started_at.startsWith(snap.date)).map((w) => ({ type: w.type }))} />

        {/* Sommeil — pleine largeur mobile, 1 col desktop */}
        <section
          className="col-span-2 sm:col-span-1 rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5"
          style={{ boxShadow: "var(--shadow-ambient)" }}
        >
          <h2 className="text-xs uppercase tracking-wide text-[var(--color-body)] mb-1 font-normal">
            Sommeil
          </h2>
          {sleepH != null ? (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-light tabular-nums text-[var(--color-heading)] dark:text-white">
                  {sleepH}h{sleepM != null ? sleepM.toString().padStart(2, "0") : ""}
                </span>
              </div>
              {(snap.today?.sleep_rem_pct != null || snap.today?.sleep_deep_pct != null) && (() => {
                const rem = snap.today?.sleep_rem_pct ?? 0;
                const deep = snap.today?.sleep_deep_pct ?? 0;
                const awake = snap.today?.sleep_awake_pct ?? null;
                const light = Math.max(0, 100 - rem - deep - (awake ?? 0));
                return (
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1.5">
                    {snap.today?.sleep_deep_pct != null && (
                      <span className="flex items-center gap-1 text-[11px]">
                        <span className="inline-block w-2 h-2 rounded-full bg-[#6366f1]" />
                        <span className="text-[#6366f1]">{Math.round(deep)}%</span>
                        <span className="text-[var(--color-body)]/60">profond</span>
                      </span>
                    )}
                    {snap.today?.sleep_rem_pct != null && (
                      <span className="flex items-center gap-1 text-[11px]">
                        <span className="inline-block w-2 h-2 rounded-full bg-[#06b6d4]" />
                        <span className="text-[#06b6d4]">{Math.round(rem)}%</span>
                        <span className="text-[var(--color-body)]/60">REM</span>
                      </span>
                    )}
                    {snap.today?.sleep_rem_pct != null && snap.today?.sleep_deep_pct != null && (
                      <span className="flex items-center gap-1 text-[11px]">
                        <span className="inline-block w-2 h-2 rounded-full bg-[#93c5fd]" />
                        <span className="text-[#93c5fd]">{Math.round(light)}%</span>
                        <span className="text-[var(--color-body)]/60">léger</span>
                      </span>
                    )}
                    {awake != null && (
                      <span className="flex items-center gap-1 text-[11px]">
                        <span className="inline-block w-2 h-2 rounded-full bg-[#f97316]" />
                        <span className="text-[#f97316]">{Math.round(awake)}%</span>
                        <span className="text-[var(--color-body)]/60">éveillé</span>
                      </span>
                    )}
                  </div>
                );
              })()}
            </>
          ) : (
            <p className="text-sm text-[var(--color-body)]">Pas de données sommeil</p>
          )}
          {sleepH != null && snap.today?.sleep_total_min != null && (
            <SleepBar
              totalMin={snap.today.sleep_total_min}
              targetMin={snap.sleepTargetMin}
              remPct={snap.today.sleep_rem_pct ?? undefined}
              deepPct={snap.today.sleep_deep_pct ?? undefined}
              awakePct={snap.today.sleep_awake_pct ?? undefined}
            />
          )}
        </section>
      </div>

      {/* ── Nutrition + Suggestion Workout — côte à côte ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NutritionTracker
          date={snap.date}
          macros={snap.macrosToday}
          targets={snap.macrosTargets}
          proteinFromLogs={snap.proteinTotalToday}
          adjustedTargets={snap.adjustedTargets}
          estimatedRemainingKcal={snap.estimatedRemainingKcal}
          activeSlot={snap.activeSlot}
        />
        <AiWorkoutSuggestion>
          <PlannedActivities date={snap.date} activities={snap.plannedActivities} />
        </AiWorkoutSuggestion>
      </div>

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
                ? lastWorkoutLabel(snap.lastWorkout.type, snap.lastWorkout.started_at)
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
      <JournalDashboard date={snap.date} impact={snap.journalImpact} />

      {/* ── Réservations Sportigo ── */}
      <Reservations />

      <div className="pb-8" />

      {/* Chatbox IA flottante */}
      <AiAnalysis />
    </main>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function StrainCard({ strain, todayWorkouts }: { strain: StrainResult; todayWorkouts: { type: string | null }[] }) {
  const bgMap: Record<string, string> = {
    light: "from-[#15be53]/10 to-[#15be53]/3 border-[#15be53]/20",
    moderate: "from-[#eab308]/10 to-[#eab308]/3 border-[#eab308]/20",
    high: "from-[#f97316]/10 to-[#f97316]/3 border-[#f97316]/20",
    very_high: "from-[#ea2261]/10 to-[#ea2261]/3 border-[#ea2261]/20",
  };
  const bg = bgMap[strain.level] ?? bgMap.light;

  return (
    <section
      className={`relative overflow-hidden rounded-[var(--radius-lg)] border bg-gradient-to-br ${bg} p-5`}
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <p className="text-xs uppercase tracking-wide text-[var(--color-body)] mb-1 font-normal">
        Strain
      </p>
      <StrainGauge strain={strain} />
      <WorkoutBadges workouts={todayWorkouts} />
    </section>
  );
}

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

function MiniMetric({
  label,
  value,
  sub,
  delta,
  positiveIsGood,
}: {
  label: string;
  value: string;
  sub?: string;
  delta: number | null;
  positiveIsGood: boolean;
}) {
  let deltaStr = "";
  let deltaColor = "text-[var(--color-body)]";
  if (delta != null) {
    const rounded = Math.round(delta * 10) / 10;
    deltaStr = rounded > 0 ? `+${rounded}` : `${rounded}`;
    if (rounded > 0)
      deltaColor = positiveIsGood
        ? "text-[#108c3d]"
        : "text-[#ea2261]";
    if (rounded < 0)
      deltaColor = positiveIsGood
        ? "text-[#ea2261]"
        : "text-[#108c3d]";
  }

  return (
    <div>
      <div className="text-xs text-[var(--color-body)]">{label}</div>
      <div className="font-normal tabular-nums text-[var(--color-heading)] dark:text-white">{value}</div>
      <div className="flex items-center gap-1">
        {sub && <span className="text-[10px] text-[var(--color-body)]">{sub}</span>}
        {deltaStr && (
          <span className={`text-[10px] tabular-nums font-normal ${deltaColor}`}>
            {deltaStr}
          </span>
        )}
      </div>
    </div>
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

function SleepBar({
  totalMin,
  targetMin,
  remPct,
  deepPct,
  awakePct,
}: {
  totalMin: number;
  targetMin: number;
  remPct?: number;
  deepPct?: number;
  awakePct?: number;
}) {
  const pct = Math.min(100, Math.round((totalMin / targetMin) * 100));
  const targetH = Math.floor(targetMin / 60);
  const targetM = targetMin % 60;
  const targetLabel = targetM > 0 ? `${targetH}h${targetM.toString().padStart(2, "0")}` : `${targetH}h`;

  const hasPhases = remPct != null && deepPct != null;
  const deep = deepPct ?? 0;
  const rem = remPct ?? 0;
  const awake = awakePct ?? 0;
  const light = Math.max(0, 100 - deep - rem - awake);

  return (
    <div className="mt-3">
      <div className="h-2.5 bg-[var(--color-border)] dark:bg-white/10 rounded-full overflow-hidden flex">
        {hasPhases ? (
          <>
            <div className="h-full bg-[#6366f1] transition-all" style={{ width: `${deep * pct / 100}%` }} />
            <div className="h-full bg-[#06b6d4] transition-all" style={{ width: `${rem * pct / 100}%` }} />
            <div className="h-full bg-[#93c5fd] transition-all" style={{ width: `${light * pct / 100}%` }} />
            {awake > 0 && (
              <div className="h-full bg-[#f97316] transition-all" style={{ width: `${awake * pct / 100}%` }} />
            )}
          </>
        ) : (
          <div
            className={`h-full transition-all ${pct >= 90 ? "bg-[#15be53]" : pct >= 75 ? "bg-[#eab308]" : "bg-[#ea2261]"}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <div className="text-[10px] text-[var(--color-body)] mt-1">
        {pct}% de {targetLabel}
      </div>
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
  const hasFat = current.body_fat_pct != null && previous.body_fat_pct != null;
  const hasLean = current.lean_mass_kg != null && previous.lean_mass_kg != null;

  if (!hasFat && !hasLean) {
    if (Math.abs(weightDiff) < 0.3) return "Poids stable — continue à tracker pour voir la tendance.";
    return weightDiff > 0
      ? `+${weightDiff} kg — pèse-toi avec la balance impédancemètre pour voir la répartition.`
      : `${weightDiff} kg — pèse-toi avec la balance impédancemètre pour voir la répartition.`;
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

function lastWorkoutLabel(type: string | null, startedAt: string): string {
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
  const cleanType = type ? (typeMap[type] ?? type) : "?";
  const d = new Date(startedAt);
  const daysDiff = Math.round(
    (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (daysDiff === 0) return `${cleanType} auj.`;
  if (daysDiff === 1) return `${cleanType} hier`;
  return `${cleanType} il y a ${daysDiff}j`;
}
