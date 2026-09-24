// Page de détail d'une mesure de la nuit (FC de sommeil, HRV, température,
// respiration, SpO₂) : valeur, position dans ta plage normale, historique.

import { notFound } from "next/navigation";
import { metricValueColor } from "@/lib/stat-colors";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserTz } from "@/lib/user-tz";
import { todayIso, isoDaysAgo, isoDateMinusDays } from "@/lib/dates";
import {
  BODY_METRICS,
  BODY_METRICS_BY_KEY,
  formatMetric,
  isFavorable,
  metricRange,
  metricStatus,
  type BodyMetricKey,
} from "@/lib/body-metrics";
import { HistoryChart } from "@/components/charts/HistoryChart";
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
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MesurePage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { key } = await params;
  const def = BODY_METRICS_BY_KEY.get(key as BodyMetricKey);
  if (!def) notFound();
  const period = parsePeriod((await searchParams).p, [7, 30, 90], 30);

  const supabase = createServiceClient();
  const tz = await getUserTz(supabase);
  const today = todayIso(tz);
  // Période affichée + 60 jours avant pour la plage normale
  const { data } = await supabase
    .from("daily_metrics")
    .select(`date, ${def.column}`)
    .gte("date", isoDaysAgo(period + 60, tz))
    .lte("date", today)
    .order("date", { ascending: true });

  const rows = ((data ?? []) as unknown as Record<string, unknown>[])
    .map((r) => ({ date: String(r.date), value: r[def.column] as number | null }))
    .filter((r): r is { date: string; value: number } => r.value != null);

  const latest = rows[rows.length - 1] ?? null;
  // Plage : les 60 jours précédant la dernière mesure (comme sur l'accueil)
  const rangeFrom = latest ? isoDateMinusDays(latest.date, 60) : today;
  const range = latest
    ? metricRange(
        rows.filter((r) => r.date >= rangeFrom && r.date < latest.date).map((r) => r.value),
        def.minHistory,
      )
    : null;
  const status = latest ? metricStatus(latest.value, range, def.normalFrom) : null;
  const favorable = isFavorable(def, status);

  const fmt = (v: number) => formatMetric(def, v);
  const rangeText = range ? `${fmt(range.low)} – ${fmt(range.high)} ${def.unit}` : null;
  const statusView =
    status == null
      ? { color: "#8e8e93", label: `plage en cours de calcul (${rows.length - 1}/${def.minHistory} nuits)` }
      : status === "in"
        ? { color: "#34c759", label: "dans ta plage habituelle" }
        : {
            color: favorable ? "#34c759" : "#ff9500",
            label: status === "above" ? "au-dessus de ta plage" : "en dessous de ta plage",
          };
  const advice =
    status == null
      ? null
      : status === "in"
        ? `Nuit dans ta norme (${rangeText}).`
        : favorable
          ? `Hors de ta plage habituelle (${rangeText}), dans le bon sens.`
          : `Inhabituel pour toi (plage ${rangeText}). Une nuit isolée n'est pas inquiétante ; surveille si ça se répète.`;

  const shown = rows.slice(-period);
  const values = shown.map((r) => r.value);
  const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;

  return (
    <DetailPage>
      <BackLink />
      {/* Autres mesures : navigation rapide */}
      <nav className="flex flex-wrap gap-1.5 [column-span:all]">
        {BODY_METRICS.map((m) => (
          <Link
            key={m.key}
            href={`/mesure/${m.key}`}
            className={`text-xs px-2.5 py-1 rounded-full ${
              m.key === def.key
                ? "bg-[var(--color-brand-purple)] text-white"
                : "bg-[var(--color-border)]/40 dark:bg-white/5 text-[var(--color-body)] hover:text-[var(--color-heading)]"
            }`}
          >
            {m.short}
          </Link>
        ))}
      </nav>

      <DetailHeader
        eyebrow={def.label}
        value={latest ? fmt(latest.value) : "—"}
        unit={def.unit}
        status={latest ? statusView : null}
        date={latest ? `Nuit du ${formatLongDate(latest.date)}` : null}
        advice={advice}
      />

      {shown.length > 0 && (
        <DetailCard title="Évolution" right={<PeriodSwitch base={`/mesure/${def.key}`} current={period} />}>
          <HistoryChart
            points={shown}
            unit={def.unit}
            decimals={def.decimals}
            band={range ? { low: range.low, high: range.high } : null}
          />
          {avg != null && (
            <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/10">
              <StatGrid
                items={[
                  { label: "Moyenne", value: `${fmt(avg)} ${def.unit}`, color: metricValueColor(def, avg, range) },
                  { label: "Max", value: `${fmt(Math.max(...values))} ${def.unit}`, color: metricValueColor(def, Math.max(...values), range) },
                  { label: "Min", value: `${fmt(Math.min(...values))} ${def.unit}`, color: metricValueColor(def, Math.min(...values), range) },
                ]}
              />
            </div>
          )}
        </DetailCard>
      )}

      <DetailCard title="À propos">
        <div className="space-y-3 text-sm text-[var(--color-body)] leading-relaxed">
          <p>{def.about}</p>
          <p>
            Ta plage normale est ta moyenne ± un écart-type sur les 60 nuits précédentes : environ deux nuits sur trois y
            tombent. Elle est personnelle ; sortir de ta plage ne veut pas dire que c&apos;est anormal médicalement, mais
            que c&apos;est inhabituel pour toi.
          </p>
          <p className="text-xs">Mesures issues de l&apos;Apple Watch, pas d&apos;un dispositif médical.</p>
        </div>
      </DetailCard>
    </DetailPage>
  );
}
