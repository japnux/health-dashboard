// Page de détail du ratio de charge (ouverte depuis la tuile de l'accueil) :
// valeur du jour et conseil, évolution sur 7/30/90 jours, aperçu chiffré, et
// explication du calcul. Mêmes briques que les autres pages de détail.

import { createServiceClient } from "@/lib/supabase/service";
import { getUserTz } from "@/lib/user-tz";
import { todayIso, isoDaysAgo } from "@/lib/dates";
import {
  ACUTE_DAYS,
  BALANCE_ZONES,
  CHRONIC_DAYS,
  balanceZone,
  loadBalanceSeries,
} from "@/lib/load-balance";
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

function fmtRatio(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

// Seuil en notation française : 0.8 → "0,8"
function fmtNum(v: number): string {
  return String(v).replace(".", ",");
}

export default async function ChargePage({
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

  const series = error ? [] : loadBalanceSeries(data ?? [], today);
  const withRatio = series.filter((p): p is typeof p & { ratio: number } => p.ratio != null);
  const latest = withRatio[withRatio.length - 1] ?? null;
  const shown = withRatio.slice(-period);
  const zone = latest ? balanceZone(latest.ratio) : null;

  const ratios = shown.map((p) => p.ratio);
  const avg = ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
  const max = ratios.length > 0 ? Math.max(...ratios) : null;
  const min = ratios.length > 0 ? Math.min(...ratios) : null;

  return (
    <DetailPage>
      <BackLink />
      {latest && zone ? (
        <DetailHeader
          eyebrow="Ratio de charge"
          value={fmtRatio(latest.ratio)}
          status={{ color: zone.color, label: zone.long }}
          date={`${formatLongDate(latest.date)} · journée en cours comprise`}
          advice={zone.advice}
        />
      ) : (
        <DetailHeader eyebrow="Ratio de charge" value="—" advice="Pas encore assez d'historique de charge cardio (4 semaines minimum)." />
      )}

      {shown.length > 0 && (
        <DetailCard title="Évolution" right={<PeriodSwitch base="/charge" current={period} />}>
          <ZonedLineChart kind="balance" points={shown.map((p) => ({ date: p.date, value: p.ratio, load: p.load }))} />
          {avg != null && max != null && min != null && (
            <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/10">
              <StatGrid
                items={[
                  { label: "Moyenne", value: fmtRatio(avg), sub: balanceZone(avg).label, color: balanceZone(avg).color },
                  { label: "Max", value: fmtRatio(max), sub: balanceZone(max).label, color: balanceZone(max).color },
                  { label: "Min", value: fmtRatio(min), sub: balanceZone(min).label, color: balanceZone(min).color },
                ]}
              />
            </div>
          )}
        </DetailCard>
      )}

      {latest && (
        <DetailCard title="Aujourd'hui">
          <StatGrid
            items={[
              { label: "Charge du jour", value: String(latest.load) },
              { label: "Charge aiguë", value: String(Math.round(latest.acute)), sub: `${ACUTE_DAYS} j` },
              { label: "Charge chronique", value: String(Math.round(latest.chronic)), sub: `${CHRONIC_DAYS} j` },
            ]}
          />
        </DetailCard>
      )}

      <DetailCard title="À propos">
        <div className="space-y-4 text-sm text-[var(--color-body)] leading-relaxed">
          <p>
            Le ratio de charge compare ce que tu as fait ces derniers jours à ce à quoi ton corps est habitué. Il dit si
            tu maintiens, augmentes ou dépasses ta capacité.
          </p>
          <div className="rounded-[var(--radius-md)] bg-[var(--color-border)]/30 dark:bg-white/5 p-4">
            <p className="text-lg text-[var(--color-heading)] dark:text-white">Ratio = charge aiguë ÷ charge chronique</p>
            <ul className="mt-2 space-y-1 text-xs">
              <li>
                <span className="text-[var(--color-heading)] dark:text-white">Charge aiguë</span> : moyenne pondérée des{" "}
                {ACUTE_DAYS} derniers jours
              </li>
              <li>
                <span className="text-[var(--color-heading)] dark:text-white">Charge chronique</span> : moyenne pondérée
                des {CHRONIC_DAYS} derniers jours, ta charge « de fond »
              </li>
            </ul>
          </div>
          <p>
            Les moyennes sont exponentielles : hier compte plus qu&apos;il y a dix jours, mais chaque jour compte un peu.
            C&apos;est la méthode recommandée par la recherche (Williams et al., 2017), plus sensible aux hausses
            brutales qu&apos;une moyenne simple.
          </p>
          <div className="space-y-2">
            {BALANCE_ZONES.map((z) => (
              <div key={z.level} className="flex gap-2.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: z.color }} />
                <p>
                  <span className="text-[var(--color-heading)] dark:text-white">
                    {z.to === Infinity
                      ? `Au-dessus de ${fmtNum(z.from)}`
                      : z.from === 0
                        ? `Sous ${fmtNum(z.to)}`
                        : `${fmtNum(z.from)} à ${fmtNum(z.to)}`}{" "}
                    · {z.long}
                  </span>
                  <br />
                  {z.advice}
                </p>
              </div>
            ))}
          </div>
          <p>
            <span className="text-[var(--color-heading)] dark:text-white">Charge du jour</span> : chaque minute au-dessus
            de 50 % de ta FC max compte, de 1 point (zone 1, facile) à 5 (zone 5, maximum), en séance comme en dehors.
            Seuils des zones : Gabbett (2016).
          </p>
        </div>
      </DetailCard>
    </DetailPage>
  );
}
