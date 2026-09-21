// Page de détail du sommeil : nuit dernière (qualité, phases, horaires,
// régularité) et historique des durées face à l'objectif.

import { getDashboardSnapshot } from "@/lib/dashboard-data";
import { createServiceClient } from "@/lib/supabase/service";
import { isoDaysAgo } from "@/lib/dates";
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
import { formatHour } from "@/components/HomeCards";

export const dynamic = "force-dynamic";

const QUALITY: Record<number, { label: string; color: string; text: string }> = {
  10: { label: "Excellent", color: "#34c759", text: "Durée et phases au rendez-vous : nuit complète et réparatrice." },
  7: { label: "Bon", color: "#34c759", text: "Bonne nuit. Il manque un peu de durée ou de sommeil profond pour qu'elle soit excellente." },
  4: { label: "Moyen", color: "#ffcc00", text: "Nuit un peu courte ou pauvre en sommeil profond / REM. Vise un coucher un peu plus tôt ce soir." },
  1: { label: "Insuffisant", color: "#ff3b30", text: "Nuit trop courte pour bien récupérer. Garde la journée légère et couche-toi tôt." },
};

function fmtHM(min: number): string {
  return `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, "0")}`;
}

export default async function SommeilPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const period = parsePeriod((await searchParams).p, [7, 30, 90], 30);
  const snap = await getDashboardSnapshot();
  const t = snap.today;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("daily_metrics")
    .select("date, sleep_total_min, sleep_deep_pct, sleep_rem_pct")
    .gte("date", isoDaysAgo(period - 1, snap.tz))
    .lte("date", snap.date)
    .order("date", { ascending: true });
  const nights = (data ?? []).filter((r) => r.sleep_total_min != null);

  const sleep = snap.recovery.components.sleep;
  const quality = sleep.available ? QUALITY[sleep.score] ?? null : null;
  const total = t?.sleep_total_min ?? null;
  const deep = t?.sleep_deep_pct ?? null;
  const rem = t?.sleep_rem_pct ?? null;
  const light = deep != null && rem != null ? Math.max(0, 100 - deep - rem) : null;
  const awakeMin = t?.sleep_awake_pct != null && total != null ? Math.round((t.sleep_awake_pct * total) / 100) : null;
  const target = snap.sleepTargetMin;

  const durations = nights.map((n) => n.sleep_total_min as number);
  const avg = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
  const onTarget = durations.filter((d) => d >= target).length;
  const avgOf = (k: "sleep_deep_pct" | "sleep_rem_pct") => {
    const v = nights.map((n) => n[k]).filter((x): x is number => x != null);
    return v.length > 0 ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };

  const bedtime = formatHour(snap.watch.bedtime, snap.tz);
  const wake = formatHour(snap.watch.wakeTime, snap.tz);

  return (
    <DetailPage>
      <BackLink />
      <DetailHeader
        eyebrow="Sommeil"
        value={quality?.label ?? (total != null ? fmtHM(total) : "—")}
        status={total != null ? { color: quality?.color ?? "#8e8e93", label: `${fmtHM(total)} · ${Math.round((total / target) * 100)} % de ton objectif (${fmtHM(target)})` } : null}
        date={t ? `Nuit du ${formatLongDate(t.date)}` : null}
        advice={quality?.text ?? null}
      />

      {total != null && (
        <DetailCard title="Cette nuit">
          {deep != null && rem != null && light != null && (
            <>
              <div className="flex h-9 rounded-[6px] overflow-hidden gap-[2px]" role="img" aria-label="Répartition des phases de sommeil">
                <div style={{ width: `${deep}%`, backgroundColor: "#5856d6" }} />
                <div style={{ width: `${rem}%`, backgroundColor: "#00c7be" }} />
                <div style={{ width: `${light}%`, backgroundColor: "#7ab8ff" }} />
              </div>
              <div className="mt-4">
                <StatGrid
                  cols={4}
                  items={[
                    { label: "Profond", value: fmtHM((deep * total) / 100), sub: `${Math.round(deep)} % · vise ≥ 15 %` },
                    { label: "REM", value: fmtHM((rem * total) / 100), sub: `${Math.round(rem)} % · vise ≥ 20 %` },
                    { label: "Léger", value: fmtHM((light * total) / 100), sub: `${Math.round(light)} %` },
                    { label: "Éveillé", value: awakeMin != null ? `${awakeMin} min` : "—", sub: "hors temps de sommeil" },
                  ]}
                />
              </div>
            </>
          )}
          {bedtime && (
            <div className="mt-5 pt-5 border-t border-black/5 dark:border-white/10">
              <StatGrid
                cols={2}
                items={[
                  { label: "Coucher → lever", value: wake ? `${bedtime} → ${wake}` : bedtime },
                  {
                    label: "Régularité",
                    value: snap.watch.bedtimeSpreadMin != null ? `±${snap.watch.bedtimeSpreadMin} min` : "—",
                    sub:
                      snap.watch.bedtimeSpreadMin != null
                        ? `heure de coucher, ${snap.watch.bedtimeNights} nuits`
                        : `à partir de 3 nuits (${snap.watch.bedtimeNights} pour l'instant)`,
                  },
                ]}
              />
            </div>
          )}
        </DetailCard>
      )}

      {nights.length > 0 && (
        <DetailCard title="Durée des nuits" right={<PeriodSwitch base="/sommeil" current={period} />}>
          <HistoryChart
            mode="bar"
            points={nights.map((n) => ({ date: n.date, value: Math.round(((n.sleep_total_min as number) / 60) * 10) / 10 }))}
            unit="h"
            decimals={1}
            target={{ value: target / 60, label: `objectif ${fmtHM(target)}` }}
          />
          {avg != null && (
            <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/10">
              <StatGrid
                cols={4}
                items={[
                  { label: "Moyenne", value: fmtHM(avg) },
                  { label: "Objectif atteint", value: `${onTarget}/${durations.length}`, sub: "nuits" },
                  { label: "Profond moy.", value: avgOf("sleep_deep_pct") != null ? `${avgOf("sleep_deep_pct")} %` : "—" },
                  { label: "REM moy.", value: avgOf("sleep_rem_pct") != null ? `${avgOf("sleep_rem_pct")} %` : "—" },
                ]}
              />
            </div>
          )}
        </DetailCard>
      )}

      <DetailCard title="À propos">
        <div className="space-y-3 text-sm text-[var(--color-body)] leading-relaxed">
          <p>
            La qualité combine la durée et les phases : <span className="text-[var(--color-heading)] dark:text-white">Excellent</span>{" "}
            à partir de 7h30 avec au moins 20 % de REM et 15 % de profond, <span className="text-[var(--color-heading)] dark:text-white">Bon</span>{" "}
            à partir de 7h avec 15 % de REM et 10 % de profond, <span className="text-[var(--color-heading)] dark:text-white">Moyen</span>{" "}
            à partir de 6h, <span className="text-[var(--color-heading)] dark:text-white">Insuffisant</span> en dessous. C&apos;est la même
            note qui entre dans ton score de récupération.
          </p>
          <p>
            Les pourcentages de phases sont calculés sur le temps de sommeil ; l&apos;éveil nocturne est compté à part. La
            régularité mesure l&apos;écart type de ton heure de coucher : moins de 30 minutes, c&apos;est régulier.
          </p>
        </div>
      </DetailCard>
    </DetailPage>
  );
}
