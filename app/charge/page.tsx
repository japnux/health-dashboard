// Page de détail de l'équilibre de charge (ouverte depuis la tuile de
// l'accueil) : valeur du jour et conseil, évolution sur 7/30/90 jours,
// aperçu chiffré, et explication du calcul.

import Link from "next/link";
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
import { LoadRatioChart } from "@/components/LoadRatioChart";

export const dynamic = "force-dynamic";

const PERIODS = [7, 30, 90] as const;

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
  const params = await searchParams;
  const requested = Number(params.p);
  const period = (PERIODS as readonly number[]).includes(requested) ? requested : 7;

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

  const card =
    "rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5";

  return (
    <main className="mx-auto max-w-2xl p-4 pb-24 sm:p-6 space-y-5">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-body)] hover:text-[var(--color-heading)] dark:hover:text-white"
      >
        ‹ Accueil
      </Link>

      <header>
        <p className="text-xs uppercase tracking-wide text-[var(--color-body)]">Équilibre de charge</p>
        {latest && zone ? (
          <>
            <p className="text-6xl font-light text-[var(--color-heading)] dark:text-white mt-2">{fmtRatio(latest.ratio)}</p>
            <p className="flex items-center gap-1.5 mt-2 text-xs uppercase tracking-wide text-[var(--color-heading)] dark:text-white">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: zone.color }} />
              {zone.long}
            </p>
            <p className="text-sm text-[var(--color-body)] mt-1">
              {new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
                new Date(`${latest.date}T12:00:00Z`),
              )}{" "}
              · journée en cours comprise
            </p>
            <p className="text-base text-[var(--color-heading)] dark:text-white mt-4 leading-relaxed">{zone.advice}</p>
          </>
        ) : (
          <p className="text-sm text-[var(--color-body)] mt-2">
            Pas encore assez d&apos;historique de charge cardio (4 semaines minimum).
          </p>
        )}
      </header>

      {shown.length > 0 && (
        <section className={card} style={{ boxShadow: "var(--shadow-ambient)" }}>
          {/* Choix de la période */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wide text-[var(--color-body)]">Évolution</p>
            <div className="flex gap-1 rounded-[var(--radius-md)] bg-[var(--color-border)]/30 dark:bg-white/5 p-1">
              {PERIODS.map((p) => (
                <Link
                  key={p}
                  href={`/charge?p=${p}`}
                  className={`text-xs px-2.5 py-1 rounded-[var(--radius-sm)] ${
                    p === period
                      ? "bg-white dark:bg-white/10 text-[var(--color-heading)] dark:text-white shadow-sm"
                      : "text-[var(--color-body)] hover:text-[var(--color-heading)]"
                  }`}
                >
                  {p} j
                </Link>
              ))}
            </div>
          </div>
          <LoadRatioChart points={shown.map((p) => ({ date: p.date, ratio: p.ratio, load: p.load }))} />

          {/* Aperçu chiffré de la période */}
          {avg != null && max != null && min != null && (
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-black/5 dark:border-white/10">
              {[
                ["Moyenne", avg],
                ["Max", max],
                ["Min", min],
              ].map(([label, v]) => (
                <div key={label as string}>
                  <p className="text-xs text-[var(--color-body)]">{label as string}</p>
                  <p className="text-xl font-light text-[var(--color-heading)] dark:text-white">{fmtRatio(v as number)}</p>
                  <p className="text-[10px] text-[var(--color-body)]">{balanceZone(v as number).label}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {latest && (
        <section className={card} style={{ boxShadow: "var(--shadow-ambient)" }}>
          <p className="text-xs uppercase tracking-wide text-[var(--color-body)] mb-3">Aujourd&apos;hui</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-[var(--color-body)]">Charge du jour</p>
              <p className="text-xl font-light text-[var(--color-heading)] dark:text-white">{latest.load}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-body)]">Charge aiguë</p>
              <p className="text-xl font-light text-[var(--color-heading)] dark:text-white">{Math.round(latest.acute)}</p>
              <p className="text-[10px] text-[var(--color-body)]">{ACUTE_DAYS} j</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-body)]">Charge chronique</p>
              <p className="text-xl font-light text-[var(--color-heading)] dark:text-white">{Math.round(latest.chronic)}</p>
              <p className="text-[10px] text-[var(--color-body)]">{CHRONIC_DAYS} j</p>
            </div>
          </div>
        </section>
      )}

      <section className={`${card} space-y-4 text-sm text-[var(--color-body)] leading-relaxed`} style={{ boxShadow: "var(--shadow-ambient)" }}>
        <p className="text-xs uppercase tracking-wide">À propos</p>
        <p>
          L&apos;équilibre de charge compare ce que tu as fait ces derniers jours à ce à quoi ton corps est habitué. Il
          dit si tu maintiens, augmentes ou dépasses ta capacité.
        </p>
        <div className="rounded-[var(--radius-md)] bg-[var(--color-border)]/30 dark:bg-white/5 p-4">
          <p className="text-lg text-[var(--color-heading)] dark:text-white">
            Équilibre = charge aiguë ÷ charge chronique
          </p>
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
                  ·{" "}
                  {z.long}
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
      </section>
    </main>
  );
}
