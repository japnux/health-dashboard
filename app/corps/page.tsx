// Page de détail de la composition corporelle : poids, masse grasse, masse
// maigre, chacun avec sa courbe et sa tendance, et le verdict selon l'objectif.

import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserTz } from "@/lib/user-tz";
import { isoDaysAgo } from "@/lib/dates";
import { computeTrend, type BodyTrend } from "@/lib/body-trend";
import { parseObjective } from "@/lib/nutrition-calc";
import {
  BODY_TREND_WINDOW,
  FAT_COLOR,
  LEAN_COLOR,
  compositionVerdict,
  formatSlope,
  latestComposition,
  trendColor,
} from "@/lib/body-composition";
import { VIVID } from "@/lib/palette";
import { BodyTrendChart } from "@/components/charts/BodyTrendChart";
import { CompositionBar } from "@/components/body/CompositionBits";
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

const fr = (v: number, d = 1) => v.toFixed(d).replace(".", ",");

// Variation sur la période d'après la tendance (moins sensible au bruit
// qu'un écart entre première et dernière pesée)
function periodChange(trend: BodyTrend | null, days: number, unit: string): string {
  if (!trend) return "—";
  const v = (trend.slopePerWeek * days) / 7;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${fr(Math.abs(v))} ${unit}`;
}

// Qualification de la tendance selon l'objectif : couleur + mot, jamais la couleur seule
function TrendWord({ color }: { color: string }) {
  const word = color === VIVID.green ? "dans le bon sens" : color === VIVID.red ? "dans le mauvais sens" : "à surveiller";
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {word}
    </span>
  );
}

export default async function CorpsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const period = parsePeriod((await searchParams).p, [90, 180, 365], 90);
  const supabase = createServiceClient();
  const tz = await getUserTz(supabase);

  const [{ data: rows }, { data: config }] = await Promise.all([
    supabase
      .from("body_composition")
      .select("measured_at, weight_kg, body_fat_pct, lean_mass_kg")
      .gte("measured_at", isoDaysAgo(Math.max(period, BODY_TREND_WINDOW), tz))
      .order("measured_at", { ascending: true }),
    supabase.from("dashboard_config").select("user_objective").eq("id", 1).maybeSingle(),
  ]);
  const bodies = rows ?? [];
  const objective = parseObjective(config?.user_objective ?? null);

  // Verdict sur 90 j, comme l'accueil ; tendances de la période pour les courbes
  const verdict = compositionVerdict(
    {
      weight: computeTrend(bodies, "weight_kg", BODY_TREND_WINDOW, tz),
      fat: computeTrend(bodies, "body_fat_pct", BODY_TREND_WINDOW, tz),
      lean: computeTrend(bodies, "lean_mass_kg", BODY_TREND_WINDOW, tz),
    },
    objective,
  );
  const trends = {
    weight: computeTrend(bodies, "weight_kg", period, tz),
    fat: computeTrend(bodies, "body_fat_pct", period, tz),
    lean: computeTrend(bodies, "lean_mass_kg", period, tz),
  };
  const last = latestComposition(bodies);
  const from = isoDaysAgo(period, tz);
  const series = (key: "weight_kg" | "body_fat_pct" | "lean_mass_kg") =>
    bodies
      .filter((b) => b[key] != null && b.measured_at.slice(0, 10) >= from)
      .map((b) => ({ date: b.measured_at.slice(0, 10), value: Number(b[key]) }));
  const weightPts = series("weight_kg");
  const fatPts = series("body_fat_pct");
  const leanPts = series("lean_mass_kg");

  const metricCard = (
    title: string,
    kind: "weight" | "fat" | "lean",
    pts: { date: string; value: number }[],
    unit: string,
    color: string,
    trendUnit: string,
  ) => {
    const trend = trends[kind];
    return (
      <DetailCard title={title} right={kind === "weight" ? <PeriodSwitch base="/corps" current={period} periods={[90, 180, 365]} /> : undefined}>
        <BodyTrendChart points={pts} unit={unit} color={color} />
        <div className="mt-3">
          <StatGrid
            items={[
              {
                label: "Tendance",
                value: formatSlope(trend, trendUnit),
                sub: trend ? <TrendWord color={trendColor(kind, trend, objective)} /> : undefined,
              },
              { label: `Sur ${period} j`, value: periodChange(trend, period, trendUnit) },
              { label: "Mesures", value: String(pts.length) },
            ]}
          />
        </div>
      </DetailCard>
    );
  };

  return (
    <DetailPage>
      <BackLink />
      <DetailHeader
        eyebrow="Composition corporelle"
        value={last.weight ? fr(last.weight.value) : "—"}
        unit="kg"
        status={{ color: verdict.color, label: verdict.label }}
        date={last.weight ? `Dernière pesée : ${formatLongDate(last.weight.date)}` : null}
        advice={verdict.text}
      />

      {last.leanKg && last.fatKg && last.fatPct && (
        <DetailCard title={`Répartition · impédance du ${formatLongDate(last.leanKg.date)}`}>
          <CompositionBar leanKg={last.leanKg.value} fatKg={last.fatKg.value} />
          <p className="text-xs text-[var(--color-body)] mt-3">
            Masse grasse {fr(last.fatPct.value)} % · masse maigre {fr(last.leanKg.value)} kg (muscles, os, organes, eau).
          </p>
        </DetailCard>
      )}

      {metricCard("Poids", "weight", weightPts, "kg", VIVID.blue, "kg")}
      {metricCard("Masse grasse", "fat", fatPts, "%", FAT_COLOR, "pt")}
      {metricCard("Masse maigre", "lean", leanPts, "kg", LEAN_COLOR, "kg")}

      <DetailCard title="À propos">
        <div className="space-y-3 text-sm text-[var(--color-body)] leading-relaxed">
          <p>
            Le verdict compare la tendance de ta masse maigre et de ta masse grasse sur 90 jours, avec ton objectif
            ({objective === "recomposition" ? "recomposition" : objective === "lean_bulk" ? "prise de masse" : objective === "cut" ? "sèche" : "maintien"}).
            La tendance est une droite ajustée sur toutes les mesures : elle lisse les écarts d&apos;un jour à l&apos;autre.
          </p>
          <p>
            L&apos;impédancemètre estime la masse grasse à partir de l&apos;eau du corps : hydratation, repas ou séance récente
            la font varier de 1 à 2 points. Pour des mesures comparables, pèse-toi le matin à jeun, au réveil, dans les
            mêmes conditions. Une pesée isolée ne veut rien dire ; la tendance sur plusieurs semaines, si.
          </p>
          <p>
            Poids seul (balance simple) : il suit l&apos;eau et le contenu digestif autant que le gras. C&apos;est la
            combinaison masse maigre / masse grasse qui dit si tu progresses.{" "}
            <Link href="/biologie" className="text-[var(--color-brand-purple)]">
              Voir la biologie ›
            </Link>
          </p>
        </div>
      </DetailCard>
    </DetailPage>
  );
}
