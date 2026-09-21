// Cartes de l'accueil (Strain, Sommeil) et leurs indicateurs.
// Composants serveur sans état : extraits de app/page.tsx pour alléger la
// page et pouvoir les afficher seuls lors des vérifications visuelles.

import type { DashboardSnapshot } from "@/lib/dashboard-data";
import type { StrainResult } from "@/lib/strain-score";
import { StrainGauge } from "@/components/StrainGauge";
import { WorkoutBadges } from "@/components/WorkoutBadges";

export function StrainCard({
  strain,
  todayWorkouts,
  watch,
  loadBalance,
}: {
  strain: StrainResult;
  todayWorkouts: { type: string | null }[];
  watch: DashboardSnapshot["watch"];
  loadBalance: DashboardSnapshot["loadBalance"];
}) {
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
      <CardioMetrics watch={watch} loadBalance={loadBalance} />
    </section>
  );
}

// Indicateurs cardio sous le Strain : équilibre de charge, effort du jour
// (FC max, FC en marche) puis forme de fond (VO2 max, récup cardio).
function CardioMetrics({
  watch,
  loadBalance,
}: {
  watch: DashboardSnapshot["watch"];
  loadBalance: DashboardSnapshot["loadBalance"];
}) {
  const items: { label: string; value: string; sub?: string }[] = [];
  if (watch.hrMaxBpm != null) {
    items.push({ label: "FC max", value: `${watch.hrMaxBpm} bpm`, sub: "aujourd'hui" });
  }
  if (watch.walkingHrBpm != null) {
    items.push({
      label: watch.walkingHrIsYesterday ? "FC marche (hier)" : "FC marche",
      value: `${watch.walkingHrBpm} bpm`,
      sub: watch.walkingHrAvg ? `moy ${watch.walkingHrAvg.days}j ${watch.walkingHrAvg.value}` : undefined,
    });
  }
  if (watch.vo2Max) {
    items.push({ label: "VO2 max", value: `${watch.vo2Max.value}`, sub: `le ${shortDate(watch.vo2Max.date)}` });
  }
  if (watch.cardioRecoveryBpm) {
    items.push({
      label: "Récup cardio",
      value: `-${watch.cardioRecoveryBpm.value} bpm`,
      sub: `1 min, le ${shortDate(watch.cardioRecoveryBpm.date)}`,
    });
  }
  if (items.length === 0 && !loadBalance) return null;

  // Couleur d'état de l'équilibre de charge (toujours accompagnée du libellé)
  const balanceDot = loadBalance
    ? { low: "#94a3b8", balanced: "#15be53", rising: "#f97316", spike: "#ea2261" }[loadBalance.level]
    : undefined;

  return (
    <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/10 space-y-4 text-sm">
      {/* Libellé long : sur toute la largeur plutôt qu'en demi-colonne */}
      {loadBalance && (
        <MiniMetric
          label="Équilibre de charge"
          value={loadBalance.ratio.toFixed(2)}
          sub={`7 j / 28 j · ${loadBalance.label}`}
          subDot={balanceDot}
          delta={null}
          positiveIsGood
        />
      )}
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          {items.map((i) => (
            <MiniMetric key={i.label} label={i.label} value={i.value} sub={i.sub} delta={null} positiveIsGood />
          ))}
        </div>
      )}
    </div>
  );
}

// Horaires sous la carte Sommeil : coucher → lever, régularité.
function SleepTiming({ watch, tz }: { watch: DashboardSnapshot["watch"]; tz: string }) {
  const bedtime = formatHour(watch.bedtime, tz);
  const wake = formatHour(watch.wakeTime, tz);
  if (!bedtime) return null;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-4 mt-5 pt-5 border-t border-black/5 dark:border-white/10 text-sm">
      {bedtime && (
        <div className="sm:col-span-2">
          <MiniMetric
            label="Coucher → lever"
            value={wake ? `${bedtime} → ${wake}` : bedtime}
            delta={null}
            positiveIsGood
          />
        </div>
      )}
      {watch.bedtimeSpreadMin != null && (
        <div className="sm:col-span-2">
        <MiniMetric
          label="Régularité"
          value={`±${watch.bedtimeSpreadMin} min`}
          sub={`coucher, ${watch.bedtimeNights} nuits`}
          delta={null}
          positiveIsGood
        />
        </div>
      )}
    </div>
  );
}

export function MiniMetric({
  label,
  value,
  sub,
  delta,
  positiveIsGood,
  chart,
  subDot,
}: {
  label: string;
  value: string;
  sub?: string;
  delta: number | null;
  positiveIsGood: boolean;
  chart?: React.ReactNode; // mini-courbe optionnelle sous la valeur
  subDot?: string; // pastille d'état (couleur) devant le sous-titre
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
    <div className="min-w-0">
      <div className="text-xs text-[var(--color-body)]">{label}</div>
      <div className="text-lg sm:text-base font-normal tabular-nums text-[var(--color-heading)] dark:text-white whitespace-nowrap">
        {value}
      </div>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
        {sub && (
          <span className="text-[11px] sm:text-[10px] text-[var(--color-body)]">
            {/* Pastille dans le texte : elle suit le sous-titre quand il passe à la ligne */}
            {subDot && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle -mt-px"
                style={{ backgroundColor: subDot }}
              />
            )}
            {sub}
          </span>
        )}
        {deltaStr && (
          <span className={`text-[11px] sm:text-[10px] tabular-nums font-normal ${deltaColor}`}>
            {deltaStr}
          </span>
        )}
      </div>
      {chart}
    </div>
  );
}

// Heure locale "23:50" (fuseau de l'utilisateur) à partir d'un ISO
export function formatHour(iso: string | null, tz: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// "2026-09-18" → "18/09"
export function shortDate(isoDate: string): string {
  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;
}

function SleepBar({
  totalMin,
  targetMin,
  remPct,
  deepPct,
}: {
  totalMin: number;
  targetMin: number;
  remPct?: number;
  deepPct?: number;
}) {
  const pct = Math.min(100, Math.round((totalMin / targetMin) * 100));
  const targetH = Math.floor(targetMin / 60);
  const targetM = targetMin % 60;
  const targetLabel = targetM > 0 ? `${targetH}h${targetM.toString().padStart(2, "0")}` : `${targetH}h`;

  const hasPhases = remPct != null && deepPct != null;
  const deep = deepPct ?? 0;
  const rem = remPct ?? 0;
  // La barre représente le sommeil vs l'objectif : l'éveil n'en fait pas partie
  const light = Math.max(0, 100 - deep - rem);

  return (
    <div className="mt-4">
      <div className="h-2.5 bg-[var(--color-border)] dark:bg-white/10 rounded-full overflow-hidden flex">
        {hasPhases ? (
          <>
            <div className="h-full bg-[#6366f1] transition-all" style={{ width: `${deep * pct / 100}%` }} />
            <div className="h-full bg-[#06b6d4] transition-all" style={{ width: `${rem * pct / 100}%` }} />
            <div className="h-full bg-[#93c5fd] transition-all" style={{ width: `${light * pct / 100}%` }} />
          </>
        ) : (
          <div
            className={`h-full transition-all ${pct >= 90 ? "bg-[#15be53]" : pct >= 75 ? "bg-[#eab308]" : "bg-[#ea2261]"}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <div className="text-[10px] text-[var(--color-body)] mt-1.5">
        {pct}% de {targetLabel}
      </div>
    </div>
  );
}

// Carte Sommeil : durée, phases, barre vs objectif, horaires et régularité
export function SleepCard({
  today,
  sleepTargetMin,
  watch,
  tz,
}: {
  tz: string;
  today: DashboardSnapshot["today"];
  sleepTargetMin: number;
  watch: DashboardSnapshot["watch"];
}) {
  const sleepH = today?.sleep_total_min ? Math.floor(today.sleep_total_min / 60) : null;
  const sleepM = today?.sleep_total_min ? Math.round(today.sleep_total_min % 60) : null;

  return (
    <section
      className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5"
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
          {(today?.sleep_rem_pct != null || today?.sleep_deep_pct != null) && (() => {
            const rem = today?.sleep_rem_pct ?? 0;
            const deep = today?.sleep_deep_pct ?? 0;
            // Le total de sommeil d'Apple exclut l'éveil : les 3 phases font
            // 100 % du sommeil, et l'éveil s'affiche à part, en minutes.
            const awakePct = today?.sleep_awake_pct ?? null;
            const awakeMin =
              awakePct != null && today?.sleep_total_min != null
                ? Math.round((awakePct * today.sleep_total_min) / 100)
                : null;
            const light = Math.max(0, 100 - rem - deep);
            return (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5">
                {today?.sleep_deep_pct != null && (
                  <span className="flex items-center gap-1 text-[11px]">
                    <span className="inline-block w-2 h-2 rounded-full bg-[#6366f1]" />
                    <span className="text-[#6366f1]">{Math.round(deep)}%</span>
                    <span className="text-[var(--color-body)]/60">profond</span>
                  </span>
                )}
                {today?.sleep_rem_pct != null && (
                  <span className="flex items-center gap-1 text-[11px]">
                    <span className="inline-block w-2 h-2 rounded-full bg-[#06b6d4]" />
                    <span className="text-[#06b6d4]">{Math.round(rem)}%</span>
                    <span className="text-[var(--color-body)]/60">REM</span>
                  </span>
                )}
                {today?.sleep_rem_pct != null && today?.sleep_deep_pct != null && (
                  <span className="flex items-center gap-1 text-[11px]">
                    <span className="inline-block w-2 h-2 rounded-full bg-[#93c5fd]" />
                    <span className="text-[#93c5fd]">{Math.round(light)}%</span>
                    <span className="text-[var(--color-body)]/60">léger</span>
                  </span>
                )}
                {awakeMin != null && (
                  <span className="flex items-center gap-1 text-[11px]">
                    <span className="inline-block w-2 h-2 rounded-full bg-[#f97316]" />
                    <span className="text-[#f97316]">{awakeMin} min</span>
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
      {sleepH != null && today?.sleep_total_min != null && (
        <SleepBar
          totalMin={today.sleep_total_min}
          targetMin={sleepTargetMin}
          remPct={today.sleep_rem_pct ?? undefined}
          deepPct={today.sleep_deep_pct ?? undefined}
        />
      )}
      <SleepTiming watch={watch} tz={tz} />
    </section>
  );
}
