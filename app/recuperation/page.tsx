// Page de détail de la récupération : ce qui compose le score du jour
// (valeur, référence, note, poids réel) et son historique.

import { getDashboardSnapshot } from "@/lib/dashboard-data";
import { recoveryValueColor } from "@/lib/stat-colors";
import { createServiceClient } from "@/lib/supabase/service";
import { isoDaysAgo } from "@/lib/dates";
import { recoveryColor } from "@/lib/recovery-score";
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

const COLOR: Record<string, string> = { green: "#34c759", yellow: "#ffcc00", red: "#ff3b30", gray: "#8e8e93" };
const LABEL: Record<string, string> = { green: "bonne", yellow: "moyenne", red: "faible", gray: "inconnue" };
const ADVICE: Record<string, string> = {
  green: "Ton corps a bien récupéré cette nuit : bon jour pour une séance exigeante.",
  yellow: "Récupération correcte mais incomplète : une séance modérée passera bien, évite l'intensité maximale.",
  red: "Récupération faible : privilégie une séance légère, de la mobilité ou du repos.",
  gray: "Pas encore de données de la nuit.",
};

const fmt1 = (v: number) => (Math.round(v * 10) / 10).toString().replace(".", ",");

export default async function RecuperationPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const period = parsePeriod((await searchParams).p, [7, 30, 90], 30);
  const snap = await getDashboardSnapshot();
  const t = snap.today;
  const color = recoveryColor(snap.recovery.score);
  const c = snap.recovery.components;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("daily_metrics")
    .select("date, recovery_score")
    .not("recovery_score", "is", null)
    .gte("date", isoDaysAgo(period - 1, snap.tz))
    .lte("date", snap.date)
    .order("date", { ascending: true });
  const history = (data ?? []).map((r) => ({ date: r.date, value: Number(r.recovery_score) }));

  // Poids réels : ceux d'un composant absent sont redistribués aux autres
  const BASE_WEIGHTS = { hrv: 0.35, restingHr: 0.25, sleep: 0.3, respiratory: 0.1 };
  const availableWeight = (Object.keys(BASE_WEIGHTS) as (keyof typeof BASE_WEIGHTS)[])
    .filter((k) => c[k].available)
    .reduce((a, k) => a + BASE_WEIGHTS[k], 0);
  const weight = (k: keyof typeof BASE_WEIGHTS) =>
    c[k].available && availableWeight > 0 ? `${Math.round((BASE_WEIGHTS[k] / availableWeight) * 100)} %` : "—";

  // Même FC que celle retenue par le score (sommeil dès 7 nuits de référence)
  const usesSleepHr = snap.recovery.hrSource === "sleeping" && snap.sleepHrBaselineAvg != null;
  const rows: { key: keyof typeof BASE_WEIGHTS; label: string; value: string; ref: string }[] = [
    {
      key: "hrv",
      label: "HRV",
      value: t?.hrv_ms != null ? `${Math.round(t.hrv_ms)} ms` : "—",
      ref: snap.hrvBaselineAvg != null ? `médiane 60 j : ${Math.round(snap.hrvBaselineAvg)} ms (plus haut = mieux)` : "",
    },
    {
      key: "restingHr",
      label: usesSleepHr ? "FC de sommeil" : "FC repos",
      value: usesSleepHr ? `${t!.sleeping_hr_bpm} bpm` : t?.resting_hr_bpm != null ? `${t.resting_hr_bpm} bpm` : "—",
      ref: usesSleepHr
        ? `moyenne 60 j : ${Math.round(snap.sleepHrBaselineAvg!)} bpm (plus bas = mieux)`
        : snap.hrBaselineAvg != null
          ? `moyenne 60 j : ${Math.round(snap.hrBaselineAvg)} bpm (plus bas = mieux)`
          : "",
    },
    {
      key: "sleep",
      label: "Sommeil",
      value:
        t?.sleep_total_min != null
          ? `${Math.floor(t.sleep_total_min / 60)}h${String(Math.round(t.sleep_total_min % 60)).padStart(2, "0")}`
          : "—",
      ref: snap.recovery.incompleteNight
        ? "nuit incomplète (moins de 3 h enregistrées) : ignorée par le score"
        : t?.sleep_rem_pct != null && t?.sleep_deep_pct != null
          ? `REM ${Math.round(t.sleep_rem_pct)} %, profond ${Math.round(t.sleep_deep_pct)} %`
          : "",
    },
    {
      key: "respiratory",
      label: "Respiration",
      value: t?.respiratory_rate != null ? `${fmt1(t.respiratory_rate)} /min` : "—",
      ref: snap.respiBaselineAvg != null ? `moyenne 60 j : ${fmt1(snap.respiBaselineAvg)} /min (plus bas = mieux)` : "",
    },
  ];

  const scores = history.map((h) => h.value);
  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  return (
    <DetailPage>
      <BackLink />
      <DetailHeader
        eyebrow="Récupération"
        value={snap.recovery.score != null ? fmt1(snap.recovery.score) : "—"}
        unit="/10"
        status={{
          color: COLOR[color],
          label: `récupération ${LABEL[color]}${snap.recovery.basis !== "full" ? ` · score ${snap.recovery.basis === "partial" ? "partiel" : "estimé"}` : ""}`,
        }}
        date={t ? `Nuit du ${formatLongDate(t.date)} · figé au réveil` : null}
        advice={ADVICE[color]}
      />

      <DetailCard title="Ce qui compose ton score">
        <div className="space-y-4">
          {rows.map((r) => {
            const comp = c[r.key];
            const barColor = !comp.available ? "#8e8e93" : comp.score >= 7 ? "#34c759" : comp.score >= 4 ? "#ffcc00" : "#ff3b30";
            return (
              <div key={r.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm text-[var(--color-heading)] dark:text-white">
                    {r.label} <span className="text-[var(--color-body)]">· {r.value}</span>
                  </p>
                  <p className="text-xs text-[var(--color-body)] tabular-nums whitespace-nowrap">
                    {comp.available ? `${fmt1(comp.score)}/10` : "non mesuré"} · poids {weight(r.key)}
                  </p>
                </div>
                <div className="h-2 rounded-full bar-track mt-1.5 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${comp.available ? comp.score * 10 : 0}%`, backgroundColor: barColor }} />
                </div>
                {r.ref && <p className="text-[11px] text-[var(--color-body)] mt-1">{r.ref}</p>}
              </div>
            );
          })}
        </div>
      </DetailCard>

      {history.length > 0 && (
        <DetailCard title="Évolution" right={<PeriodSwitch base="/recuperation" current={period} />}>
          <ZonedLineChart kind="recovery" points={history} />
          {avg != null && (
            <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/10">
              <StatGrid
                items={[
                  { label: "Moyenne", value: fmt1(avg), color: recoveryValueColor(avg) },
                  { label: "Max", value: fmt1(Math.max(...scores)), color: recoveryValueColor(Math.max(...scores)) },
                  { label: "Min", value: fmt1(Math.min(...scores)), color: recoveryValueColor(Math.min(...scores)) },
                ]}
              />
            </div>
          )}
        </DetailCard>
      )}

      <DetailCard title="À propos">
        <div className="space-y-3 text-sm text-[var(--color-body)] leading-relaxed">
          <p>
            Le score dit dans quel état ta nuit t&apos;a remis, sur 10. Il compare quatre mesures de la nuit à tes propres
            références des 60 derniers jours : HRV (35 %), fréquence cardiaque pendant le sommeil (25 %), sommeil
            (30 %) et respiration (10 %). Si une mesure manque, son poids est réparti sur les autres et le score est
            marqué partiel.
          </p>
          <p>
            Il est calculé une fois la nuit terminée et ne bouge plus dans la journée : l&apos;effort du jour se lit dans le
            Strain. 7 et plus : bonne récupération ; 5 à 7 : moyenne ; moins de 5 : faible.
          </p>
        </div>
      </DetailCard>
    </DetailPage>
  );
}
