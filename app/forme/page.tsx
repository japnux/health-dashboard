// Page de détail de la forme d'entraînement (charge chronique − aiguë).

import { createServiceClient } from "@/lib/supabase/service";
import { getUserTz } from "@/lib/user-tz";
import { todayIso, isoDaysAgo } from "@/lib/dates";
import { loadBalanceSeries } from "@/lib/load-balance";
import { FORM_ZONES, formSeries, formZone } from "@/lib/form";
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
import { fmtForm } from "@/components/home/TodaySections";

export const dynamic = "force-dynamic";

export default async function FormePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const period = parsePeriod((await searchParams).p, [7, 30, 90], 7);
  const supabase = createServiceClient();
  const tz = await getUserTz(supabase);
  const today = todayIso(tz);

  const { data, error } = await supabase
    .from("daily_metrics")
    .select("date, cardio_load")
    .not("cardio_load", "is", null)
    .gte("date", isoDaysAgo(365, tz))
    .lte("date", today)
    .order("date", { ascending: true });

  const series = error ? [] : formSeries(loadBalanceSeries(data ?? [], today));
  const latest = series[series.length - 1] ?? null;
  const shown = series.slice(-period);
  const zone = latest ? formZone(latest.form) : null;

  const values = shown.map((p) => p.form);
  const avg = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  const maxP = shown.length > 0 ? shown.reduce((m, p) => (p.form > m.form ? p : m)) : null;
  const minP = shown.length > 0 ? shown.reduce((m, p) => (p.form < m.form ? p : m)) : null;
  const shortDate = (d: string) =>
    new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

  // Jours passés dans chaque zone sur la période (du plus reposé au plus chargé)
  const distribution = [...FORM_ZONES].reverse().map((z) => {
    const days = shown.filter((p) => formZone(p.form).level === z.level).length;
    return { ...z, days, pct: shown.length > 0 ? Math.round((days / shown.length) * 100) : 0 };
  });

  return (
    <DetailPage>
      <BackLink />
      {latest && zone ? (
        <DetailHeader
          eyebrow="Forme d'entraînement"
          value={fmtForm(latest.form)}
          status={{ color: zone.color, label: zone.long }}
          date={`${formatLongDate(latest.date)} · journée en cours comprise`}
          advice={zone.advice}
        />
      ) : (
        <DetailHeader eyebrow="Forme d'entraînement" value="—" advice="Pas encore assez d'historique de charge cardio (4 semaines minimum)." />
      )}

      {shown.length > 0 && (
        <DetailCard title="Évolution" right={<PeriodSwitch base="/forme" current={period} />}>
          <ZonedLineChart kind="form" points={shown.map((p) => ({ date: p.date, value: p.form }))} />
          {avg != null && maxP && minP && (
            <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/10">
              <StatGrid
                items={[
                  { label: "Moyenne", value: fmtForm(avg), sub: formZone(avg).label },
                  { label: "Max", value: fmtForm(maxP.form), sub: shortDate(maxP.date) },
                  { label: "Min", value: fmtForm(minP.form), sub: shortDate(minP.date) },
                ]}
              />
            </div>
          )}
        </DetailCard>
      )}

      {shown.length > 0 && (
        <DetailCard title={`Jours par zone (${period} j)`}>
          <div className="space-y-2.5">
            {distribution.map((z) => (
              <div key={z.level} className="flex items-center gap-3 text-sm">
                <span className="w-28 sm:w-44 shrink-0 leading-tight text-[var(--color-heading)] dark:text-white">{z.long}</span>
                <div className="flex-1 h-2.5 rounded-full bar-track overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${z.pct}%`, backgroundColor: z.color }} />
                </div>
                <span className="w-10 text-right tabular-nums text-[var(--color-body)]">{z.pct} %</span>
                <span className="w-8 text-right tabular-nums text-[var(--color-body)]">{z.days} j</span>
              </div>
            ))}
          </div>
        </DetailCard>
      )}

      <DetailCard title="À propos">
        <div className="space-y-4 text-sm text-[var(--color-body)] leading-relaxed">
          <p>
            La forme mesure l&apos;équilibre entre ton niveau d&apos;entraînement de fond et la fatigue récente. Être en
            forme, ce n&apos;est pas avoir la plus grosse charge : c&apos;est être entraîné et assez reposé pour
            l&apos;exprimer.
          </p>
          <div className="rounded-[var(--radius-md)] bg-[var(--color-border)]/30 dark:bg-white/5 p-4">
            <p className="text-lg text-[var(--color-heading)] dark:text-white">Forme = charge chronique − charge aiguë</p>
            <ul className="mt-2 space-y-1 text-xs">
              <li>Charge chronique : moyenne pondérée des 42 derniers jours (ton niveau de fond)</li>
              <li>Charge aiguë : moyenne pondérée des 7 derniers jours (ta fatigue récente)</li>
            </ul>
          </div>
          <p>
            Positive : tu es reposé par rapport à ton niveau, prêt à performer. Négative : la fatigue de l&apos;entraînement
            récent est présente, ce qui est normal (et voulu) pendant un bloc d&apos;entraînement. Pour préparer un objectif,
            on réduit la charge quelques jours avant afin de repasser en positif le jour J.
          </p>
          <div className="space-y-2">
            {[...FORM_ZONES].reverse().map((z) => (
              <div key={z.level} className="flex gap-2.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: z.color }} />
                <p>
                  <span className="text-[var(--color-heading)] dark:text-white">
                    {z.to === Infinity ? `Au-dessus de +${z.from}` : z.from === -Infinity ? `Sous ${fmtForm(z.to)}` : `${fmtForm(z.from)} à ${fmtForm(z.to)}`}{" "}
                    · {z.long}
                  </span>
                  <br />
                  {z.advice}
                </p>
              </div>
            ))}
          </div>
          <p>
            Échelle : 100 points = une heure à ton seuil (environ 88 % de ta FC max), comme le TSS des outils
            d&apos;entraînement. Les seuils de zone sont ceux du modèle forme / fatigue (TrainingPeaks).
          </p>
        </div>
      </DetailCard>
    </DetailPage>
  );
}
