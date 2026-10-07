// Page de détail du sommeil : score de la nuit (durée vs besoin, régularité,
// interruptions), phases en minutes, dette, régularité et historique.
// Calculs : lib/sleep (même source que l'accueil, les stats et l'IA).

import { getDashboardSnapshot } from "@/lib/dashboard-data";
import { createServiceClient } from "@/lib/supabase/service";
import { isoDaysAgo } from "@/lib/dates";
import { HistoryChart } from "@/components/charts/HistoryChart";
import { SleepWindowsChart } from "@/components/charts/SleepWindowsChart";
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
import {
  bedtimeSpread,
  debtColor,
  deepMinutesColor,
  formatClock,
  formatDuration,
  formatShift,
  isCompleteNight,
  napMinutes,
  nightPhases,
  sleepRegularityIndex,
  sleepWindow,
  sriColor,
  type ScoreComponent,
  type SleepRow,
} from "@/lib/sleep";
import { remSleepColor, shareColor, sleepDurationColor } from "@/lib/stat-colors";
import { VIVID } from "@/lib/palette";

export const dynamic = "force-dynamic";

const PHASE_COLORS = { deep: "#5856d6", rem: "#00c7be", core: "#7ab8ff", awake: "#ff9500" };

export default async function SommeilPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const period = parsePeriod((await searchParams).p, [7, 30, 90], 30);
  const snap = await getDashboardSnapshot();
  const s = snap.sleep;
  const need = snap.sleepTargetMin;
  const tz = snap.tz;

  // Période affichée + 60 nuits avant, pour les plages habituelles
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("daily_metrics")
    .select("date, sleep_total_min, sleep_deep_pct, sleep_rem_pct, sleep_awake_pct, sleep_start, sleep_end, naps, tz_offset_min")
    .gte("date", isoDaysAgo(period - 1 + 60, tz))
    .lte("date", snap.date)
    .order("date", { ascending: true });
  const rows = (data ?? []) as SleepRow[];
  const periodStart = isoDaysAgo(period - 1, tz);
  const inPeriod = rows.filter((r) => r.date >= periodStart);
  const nights = inPeriod.filter((r) => r.sleep_total_min != null);
  // Nuits incomplètes (moins de 3 h, montre retirée…) : visibles sur le
  // graphique mais exclues des moyennes
  const fullNights = nights.filter(isCompleteNight);

  const durations = fullNights.map((n) => n.sleep_total_min!);
  const avg = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
  const onNeed = durations.filter((d) => d >= need).length;
  const mean = (vals: (number | null | undefined)[]) => {
    const v = vals.filter((x): x is number => x != null);
    return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const deepAvg = mean(fullNights.map((n) => nightPhases(n)?.deepMin));
  const remAvg = mean(fullNights.map((n) => n.sleep_rem_pct));
  const periodSri = sleepRegularityIndex(rows, snap.date, tz, period);
  const periodSpread = bedtimeSpread(inPeriod, tz);

  const score = s.score;
  const p = s.phases;
  const w = s.window;

  return (
    <DetailPage>
      <BackLink />
      <DetailHeader
        eyebrow="Sommeil"
        value={score ? String(score.score) : p ? formatDuration(p.totalMin) : "—"}
        unit={score ? "/100" : undefined}
        status={
          score
            ? {
                color: score.color,
                label: `${score.label} · ${formatDuration(score.duration.sleptMin)} · ${Math.round((score.duration.sleptMin / need) * 100)} % de ton besoin (${formatDuration(need)})`,
              }
            : s.incomplete
              ? { color: VIVID.gray, label: "Nuit incomplète (moins de 3 h enregistrées)" }
              : null
        }
        date={snap.today ? `Nuit du ${formatLongDate(snap.date)}` : null}
        advice={
          s.advice ??
          (s.incomplete ? "Montre retirée ou en charge une partie de la nuit : pas de score, cette nuit est ignorée." : "Pas encore de données de nuit.")
        }
      />

      {score && (
        <DetailCard title="Le score de la nuit">
          <div className="space-y-4">
            <ScoreRow
              label="Durée"
              c={score.duration}
              detail={`${formatDuration(score.duration.sleptMin)} pour un besoin de ${formatDuration(need)}`}
            />
            <ScoreRow
              label="Régularité"
              c={score.regularity}
              detail={
                score.regularity.available && w
                  ? `couché à ${formatClock(w.bed)}, ${score.regularity.deviationMin} min plus ${score.regularity.early ? "tôt" : "tard"} que ton heure habituelle (${formatClock(score.regularity.usualBed!)})${
                      score.regularity.shiftTolerated ? ", décalage horaire pris en compte" : ""
                    }`
                  : "à partir de 4 nuits avec horaires"
              }
            />
            <ScoreRow
              label="Interruptions"
              c={score.interruptions}
              detail={
                score.interruptions.awakeMin != null
                  ? `${score.interruptions.awakeMin} min d'éveil, habituel jusqu'à ${score.interruptions.usualMax} min`
                  : "éveil non mesuré"
              }
            />
          </div>
          {s.timeShift && w && (
            <p className="mt-4 rounded-[8px] bg-[#5856d6]/10 px-3 py-2 text-sm text-[var(--color-body)] leading-relaxed">
              <Strong>
                Décalage horaire : {formatShift(s.timeShift.shiftMin)} depuis {s.timeShift.nights} nuit{s.timeShift.nights > 1 ? "s" : ""}.
              </Strong>{" "}
              Tes horaires sont lus à l&apos;heure locale. À ton ancienne heure, ton coucher de {formatClock(w.bed)} tombe à{" "}
              {formatClock(w.bed - s.timeShift.shiftMin)}. L&apos;horloge interne se recale d&apos;environ une heure par jour.
            </p>
          )}
          {w && (
            <div className="mt-5 pt-5 border-t border-black/5 dark:border-white/10">
              <StatGrid
                cols={4}
                items={[
                  { label: "Coucher", value: formatClock(w.bed) },
                  { label: "Lever", value: formatClock(w.wake) },
                  { label: "Milieu de nuit", value: formatClock(w.mid) },
                  s.napMinYesterday > 0
                    ? { label: "Sieste d'hier", value: `${s.napMinYesterday} min`, sub: "compte dans la dette", color: PHASE_COLORS.deep }
                    : {
                        label: "Coucher habituel",
                        value: score.regularity.usualBed != null ? formatClock(score.regularity.usualBed) : "—",
                        sub: "médiane des 13 nuits précédentes",
                      },
                ]}
              />
            </div>
          )}
        </DetailCard>
      )}

      {p && p.deepMin != null && p.remMin != null && p.coreMin != null && (
        <DetailCard title="Les phases de la nuit">
          <div className="flex h-9 rounded-[6px] overflow-hidden gap-[2px]" role="img" aria-label="Répartition des phases de sommeil">
            <div style={{ width: `${(p.deepMin / p.totalMin) * 100}%`, backgroundColor: PHASE_COLORS.deep }} />
            <div style={{ width: `${(p.remMin / p.totalMin) * 100}%`, backgroundColor: PHASE_COLORS.rem }} />
            <div style={{ width: `${(p.coreMin / p.totalMin) * 100}%`, backgroundColor: PHASE_COLORS.core }} />
          </div>
          <div className="mt-4">
            <StatGrid
              cols={4}
              items={[
                {
                  label: "Profond",
                  value: `${Math.round(p.deepMin)} min`,
                  sub: s.deepRange
                    ? `ta plage : ${Math.round(s.deepRange.low)}–${Math.round(s.deepRange.high)} min`
                    : "plage après 14 nuits",
                  color: deepMinutesColor(p.deepMin, s.deepRange),
                },
                {
                  label: "REM",
                  value: formatDuration(p.remMin),
                  sub: `${Math.round(p.remPct ?? 0)} % · repère ≥ 20 %`,
                  color: p.remPct != null ? remSleepColor(p.remPct) : undefined,
                },
                { label: "Léger", value: formatDuration(p.coreMin), sub: `${Math.round((p.coreMin / p.totalMin) * 100)} %`, color: PHASE_COLORS.core },
                {
                  label: "Éveil",
                  value: p.awakeMin != null ? `${Math.round(p.awakeMin)} min` : "—",
                  sub: s.awakeRange ? `habituel : ${Math.round(s.awakeRange.median)} min` : "pendant la nuit",
                },
              ]}
            />
          </div>
          <p className="text-xs text-[var(--color-body)] mt-4 leading-relaxed">
            Le sommeil profond se juge en minutes et par rapport à toi : il se concentre en début de nuit et ne s&apos;allonge
            presque pas quand tu dors plus, donc son pourcentage baisse mécaniquement sur une longue nuit. La montre le
            sous-estime (25 à 40 min en moyenne) : seule la tendance compte. Le REM, lui, se loge en fin de nuit : une nuit
            écourtée le coupe en premier.
          </p>
        </DetailCard>
      )}

      <DetailCard title="Dette de sommeil · 14 nuits">
        <StatGrid
          items={[
            {
              label: "Dette",
              value: s.debt.debtMin < 1 ? "aucune" : formatDuration(s.debt.debtMin),
              color: debtColor(s.debt.debtMin),
            },
            {
              label: "Moyenne",
              value: s.debt.avgSleptMin != null ? formatDuration(s.debt.avgSleptMin) : "—",
              sub: "siestes comprises",
              color: s.debt.avgSleptMin != null ? sleepDurationColor(s.debt.avgSleptMin, need) : undefined,
            },
            {
              label: "Nuits au besoin",
              value: `${s.debt.nightsOnNeed}/${s.debt.nights}`,
              color: s.debt.nights > 0 ? shareColor(s.debt.nightsOnNeed / s.debt.nights) : undefined,
            },
          ]}
        />
        <p className="text-xs text-[var(--color-body)] mt-3 leading-relaxed">
          Manque cumulé par rapport à ton besoin, les nuits récentes pesant plus. Une grosse nuit ne rembourse qu&apos;une heure
          au plus : la récupération d&apos;une dette prend plusieurs nuits, et on ne la ressent pas toujours.
        </p>
      </DetailCard>

      <DetailCard title="Régularité" right={<PeriodSwitch base="/sommeil" current={period} />}>
        <SleepWindowsChart
          nights={inPeriod.map((r) => {
            const win = sleepWindow(r, tz);
            return {
              date: r.date,
              bed: win?.bed ?? null,
              wake: win?.wake ?? null,
              color: isCompleteNight(r) ? sleepDurationColor(r.sleep_total_min!, need) : VIVID.gray,
              napMin: napMinutes(r),
            };
          })}
          usualBed={score?.regularity.usualBed ?? null}
        />
        <div className="mt-4">
          <StatGrid
            items={[
              {
                label: "Indice de régularité",
                value: periodSri != null ? `${periodSri}/100` : "—",
                sub: periodSri != null ? `sur ${period} j` : "à partir de 7 nuits avec horaires",
                color: periodSri != null ? sriColor(periodSri) : undefined,
              },
              {
                label: "Sur 14 nuits",
                value: s.sri != null ? `${s.sri}/100` : "—",
                color: s.sri != null ? sriColor(s.sri) : undefined,
              },
              {
                label: "Écart du coucher",
                value: periodSpread != null ? `±${periodSpread} min` : "—",
                sub: "écart-type",
              },
            ]}
          />
        </div>
        <p className="text-xs text-[var(--color-body)] mt-3 leading-relaxed">
          L&apos;indice mesure la probabilité d&apos;être endormi ou éveillé à la même heure d&apos;un jour à l&apos;autre (100 =
          parfaitement régulier). Sur 61 000 personnes, la médiane est de 81, et la régularité prédit mieux la santé que la
          durée. Sous 72 : le groupe le plus irrégulier.
        </p>
      </DetailCard>

      {nights.length > 0 && (
        <DetailCard title="Durée des nuits" right={<PeriodSwitch base="/sommeil" current={period} />}>
          <HistoryChart
            mode="bar"
            points={nights.map((n) => ({
              date: n.date,
              value: Math.round((n.sleep_total_min! / 60) * 10) / 10,
              color: isCompleteNight(n) ? sleepDurationColor(n.sleep_total_min!, need) : VIVID.gray,
            }))}
            unit="h"
            decimals={1}
            target={{ value: need / 60, label: `besoin ${formatDuration(need)}` }}
          />
          {avg != null && (
            <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/10">
              <StatGrid
                cols={4}
                items={[
                  { label: "Moyenne", value: formatDuration(avg), color: sleepDurationColor(avg, need) },
                  {
                    label: "Nuits au besoin",
                    value: `${onNeed}/${durations.length}`,
                    sub: `${formatDuration(need)} ou plus`,
                    color: shareColor(onNeed / durations.length),
                  },
                  {
                    label: "Profond moy.",
                    value: deepAvg != null ? `${Math.round(deepAvg)} min` : "—",
                    color: deepAvg != null ? deepMinutesColor(deepAvg, s.deepRange) : undefined,
                  },
                  {
                    label: "REM moy.",
                    value: remAvg != null ? `${Math.round(remAvg)} %` : "—",
                    sub: "repère ≥ 20 %",
                    color: remAvg != null ? remSleepColor(remAvg) : undefined,
                  },
                ]}
              />
            </div>
          )}
        </DetailCard>
      )}

      <DetailCard title="À propos">
        <div className="space-y-3 text-sm text-[var(--color-body)] leading-relaxed">
          <p>
            Le score /100 reprend la logique du score de sommeil d&apos;Apple : <Strong>durée</Strong> face à ton besoin
            (50 points), <Strong>régularité</Strong> de ton coucher face à tes 13 nuits précédentes (30 points) et{" "}
            <Strong>interruptions</Strong> face à ton éveil habituel (20 points). Il entre pour 30 % dans ton score de
            récupération.
          </p>
          <p>
            Le coucher n&apos;est pas jugé de la même façon dans les deux sens. Plus tard que d&apos;habitude : rien jusqu&apos;à
            15 min, puis 1 point par 5 min. Plus tôt : rien jusqu&apos;à 60 min, puis 1 point par 30 min, 6 points au plus.
          </p>
          <p>
            Chaque nuit est lue à l&apos;heure locale de l&apos;endroit où tu l&apos;as dormie : en voyage, ton coucher habituel
            reste celui de ta montre. Après un changement de fuseau, un coucher à l&apos;heure de ton ancien fuseau n&apos;est
            pas pénalisé pendant quelques nuits, le temps que ton horloge interne se recale.
          </p>
          <p>
            Ce que la montre mesure bien : la durée, l&apos;heure de coucher et de lever. Moins bien : l&apos;éveil
            (sous-compté) et surtout le sommeil profond (environ la moitié reconnue). Pas du tout : le temps passé au lit,
            donc ni l&apos;efficacité ni le temps d&apos;endormissement. Les phases restent donc hors du score.
          </p>
          <p>
            Repères : au moins 7 h pour un adulte (consensus AASM/SRS), REM autour de 20 à 25 % de la nuit, régularité
            (Phillips 2017, Windred 2024). La dette est une estimation, pas une mesure validée.
          </p>
        </div>
      </DetailCard>
    </DetailPage>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="text-[var(--color-heading)] dark:text-white">{children}</span>;
}

// Une composante du score : points, barre, explication
function ScoreRow({ label, c, detail }: { label: string; c: ScoreComponent; detail: string }) {
  const share = c.available ? c.points / c.max : 0;
  const color = !c.available ? VIVID.gray : share >= 0.8 ? VIVID.green : share >= 0.5 ? VIVID.yellow : VIVID.orange;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-[var(--color-heading)] dark:text-white">{label}</p>
        <p className="text-xs text-[var(--color-body)] tabular-nums whitespace-nowrap">
          {c.available ? `${Math.round(c.points)}/${c.max}` : "non mesuré"}
        </p>
      </div>
      <div className="h-2 rounded-full bar-track mt-1.5 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${share * 100}%`, backgroundColor: color }} />
      </div>
      <p className="text-[11px] text-[var(--color-body)] mt-1">{detail}</p>
    </div>
  );
}
