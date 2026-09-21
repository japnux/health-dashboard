// Page de détail d'une séance : chiffres clés comparés aux séances du même
// type sur 30 jours, et répartition du temps par zone de fréquence cardiaque.

import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserTz } from "@/lib/user-tz";
import { normalizeWorkoutType, workoutDisplayLabel } from "@/lib/workout-types";
import { HR_ZONES } from "@/lib/hr-zones";
import { getHrMax } from "@/lib/cardio-load";
import { heartRateRecoveryDrop, type RecoveryPoint } from "@/lib/workout-details";
import { BackLink, DetailCard, DetailPage, Delta, StatGrid } from "@/components/detail/DetailBits";
import { WorkoutHrChart } from "@/components/charts/WorkoutHrChart";
import { RouteMap } from "@/components/charts/RouteMap";

export const dynamic = "force-dynamic";

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

function mean(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x != null);
  return v.length > 0 ? v.reduce((a, b) => a + Number(b), 0) / v.length : null;
}

export default async function SeancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Identifiant attendu : UUID (évite une requête inutile sur une URL fantaisiste)
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = createServiceClient();
  const [{ data: w }, tz, hrMax] = await Promise.all([
    supabase.from("workouts").select("*").eq("id", id).maybeSingle(),
    getUserTz(supabase),
    getHrMax(supabase),
  ]);
  if (!w) notFound();

  // Séances du même type sur les 30 jours précédents (hors celle-ci)
  const typeKey = normalizeWorkoutType(w.type ?? "");
  const from = new Date(new Date(w.started_at).getTime() - 30 * 86_400_000).toISOString();
  const { data: others } = await supabase
    .from("workouts")
    .select("type, duration_min, kcal, avg_hr_bpm, cardio_load, hr_recovery")
    .gte("started_at", from)
    .lt("started_at", w.started_at);
  const same = (others ?? []).filter((o) => normalizeWorkoutType(o.type ?? "") === typeKey);

  const ref = {
    duration: mean(same.map((o) => o.duration_min)),
    load: mean(same.map((o) => (o.cardio_load != null ? Number(o.cardio_load) : null))),
    hr: mean(same.map((o) => o.avg_hr_bpm)),
    kcal: mean(same.map((o) => o.kcal)),
    drop1: mean(same.map((o) => heartRateRecoveryDrop(o.hr_recovery as RecoveryPoint[] | null)?.drop1 ?? null)),
  };
  const hrr = heartRateRecoveryDrop(w.hr_recovery as RecoveryPoint[] | null);
  const hrrLevel =
    hrr?.drop1 == null
      ? null
      : hrr.drop1 >= 20
        ? { label: "bonne", color: "#15be53" }
        : hrr.drop1 >= 12
          ? { label: "correcte", color: "#eab308" }
          : { label: "faible", color: "#ea2261" };
  const fmtKm = (v: number) => (v < 10 ? v.toFixed(2) : v.toFixed(1)).replace(".", ",");
  const label = workoutDisplayLabel(w.type ?? "Séance");
  const start = new Date(w.started_at);
  const zones = Array.isArray(w.hr_zone_min) && w.hr_zone_min.length === 5 ? (w.hr_zone_min as number[]) : null;
  const zoneTotal = zones ? zones.reduce((a, b) => a + b, 0) : 0;
  const diff = (v: number | null, r: number | null) => (v != null && r != null ? v - r : null);
  const refSub = (r: number | null, fmt: (v: number) => string) => (r != null ? `moy. ${fmt(r)}` : "pas de référence");

  return (
    <DetailPage>
      <BackLink />
      <header>
        <p className="text-xs uppercase tracking-wide text-[var(--color-body)]">Séance</p>
        <p className="text-5xl font-light text-[var(--color-heading)] dark:text-white mt-2">{label}</p>
        <p className="text-sm text-[var(--color-body)] mt-2">
          {/* Majuscule sur le premier mot seulement ("capitalize" les mettait partout) */}
          {(() => {
            const d = start.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz });
            return d.charAt(0).toUpperCase() + d.slice(1);
          })()}{" "}
          à {start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: tz })}
        </p>
        {w.source && <p className="text-xs text-[var(--color-body)]/70 mt-0.5">Source : {w.source}</p>}
      </header>

      <DetailCard title={same.length > 0 ? `Chiffres clés · vs ${label} sur 30 j (${same.length} séances)` : "Chiffres clés"}>
        <StatGrid
          cols={2}
          items={[
            {
              label: "Durée",
              value: w.duration_min != null ? fmtDuration(w.duration_min) : "—",
              sub: (
                <>
                  <Delta diff={diff(w.duration_min, ref.duration)} betterWhen="none" format={(v) => fmtDuration(v)} />{" "}
                  <span className="text-[var(--color-body)]/70">{refSub(ref.duration, fmtDuration)}</span>
                </>
              ),
            },
            {
              label: "Charge cardio",
              value: w.cardio_load != null ? String(Math.round(Number(w.cardio_load))) : "—",
              sub: (
                <>
                  <Delta
                    diff={diff(w.cardio_load != null ? Number(w.cardio_load) : null, ref.load)}
                    betterWhen="none"
                    format={(v) => String(Math.round(v))}
                  />{" "}
                  <span className="text-[var(--color-body)]/70">{refSub(ref.load, (v) => String(Math.round(v)))}</span>
                </>
              ),
            },
            {
              label: "FC moyenne",
              value: w.avg_hr_bpm != null ? `${w.avg_hr_bpm} bpm` : "—",
              sub: (
                <>
                  <Delta diff={diff(w.avg_hr_bpm, ref.hr)} betterWhen="none" format={(v) => `${Math.round(v)} bpm`} />{" "}
                  <span className="text-[var(--color-body)]/70">{refSub(ref.hr, (v) => `${Math.round(v)} bpm`)}</span>
                </>
              ),
            },
            {
              label: "Énergie active",
              value: w.kcal != null ? `${w.kcal} kcal` : "—",
              sub: (
                <>
                  <Delta diff={diff(w.kcal, ref.kcal)} betterWhen="none" format={(v) => `${Math.round(v)} kcal`} />{" "}
                  <span className="text-[var(--color-body)]/70">{refSub(ref.kcal, (v) => `${Math.round(v)} kcal`)}</span>
                </>
              ),
            },
          ]}
        />
        {w.max_hr_bpm != null && <p className="text-xs text-[var(--color-body)] mt-4">FC max de la séance : {w.max_hr_bpm} bpm</p>}
      </DetailCard>

      {w.route && w.route.length >= 2 && (
        <DetailCard title="Tracé">
          <RouteMap route={w.route} />
          <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/10">
            <StatGrid
              items={[
                { label: "Distance", value: w.distance_km != null ? `${fmtKm(Number(w.distance_km))} km` : "—" },
                { label: "Vitesse moy.", value: w.avg_speed_kmh != null ? `${String(w.avg_speed_kmh).replace(".", ",")} km/h` : "—" },
                { label: "Vitesse max", value: w.max_speed_kmh != null ? `${String(w.max_speed_kmh).replace(".", ",")} km/h` : "—" },
              ]}
            />
          </div>
        </DetailCard>
      )}

      {w.hr_series && w.hr_series.length >= 2 && (
        <DetailCard title="Fréquence cardiaque">
          <WorkoutHrChart series={w.hr_series} hrMax={hrMax} />
        </DetailCard>
      )}

      <DetailCard title="Zones cardio">
        {zones && zoneTotal > 0 ? (
          <div className="space-y-2.5">
            {[...HR_ZONES].reverse().map((z) => {
              const i = HR_ZONES.findIndex((x) => x.key === z.key);
              const min = zones[i];
              const pct = Math.round((min / zoneTotal) * 100);
              return (
                <div key={z.key} className="flex items-center gap-3 text-sm">
                  <span className="w-32 sm:w-40 shrink-0 text-[var(--color-heading)] dark:text-white">
                    {z.label} {z.name}
                    <span className="block text-[10px] text-[var(--color-body)]">{z.range} FC max</span>
                  </span>
                  <div className="flex-1 h-2.5 rounded-full bg-[var(--color-border)] dark:bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: z.color }} />
                  </div>
                  <span className="w-10 text-right tabular-nums text-[var(--color-body)]">{pct} %</span>
                  <span className="w-14 text-right tabular-nums text-[var(--color-body)]">{fmtDuration(min)}</span>
                </div>
              );
            })}
            <p className="text-[11px] text-[var(--color-body)] pt-1">
              Temps passé au-dessus de 50 % de ta FC max : {fmtDuration(zoneTotal)}.
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-body)]">Pas de fréquence cardiaque minute par minute pour cette séance.</p>
        )}
      </DetailCard>

      {hrr && (
        <DetailCard title="Récupération cardio">
          <StatGrid
            items={[
              { label: "FC à l'arrêt", value: `${hrr.endHr} bpm` },
              {
                label: "Après 1 min",
                value: hrr.drop1 != null ? `−${hrr.drop1} bpm` : "—",
                sub: (
                  <>
                    {hrrLevel && <span style={{ color: hrrLevel.color }}>{hrrLevel.label}</span>}
                    {ref.drop1 != null && (
                      <span className="text-[var(--color-body)]/70">
                        {hrrLevel ? " · " : ""}moy. {label} −{Math.round(ref.drop1)}
                      </span>
                    )}
                  </>
                ),
              },
              { label: "Après 2 min", value: hrr.drop2 != null ? `−${hrr.drop2} bpm` : "—" },
            ]}
          />
          <p className="text-[11px] text-[var(--color-body)] mt-4 leading-relaxed">
            Vitesse à laquelle ton cœur redescend quand tu t&apos;arrêtes : plus la baisse est forte, meilleure est ta
            forme cardio. En 1 minute, moins de 12 bpm est faible, 12 à 20 correct, plus de 20 bon. Elle dépend aussi de la
            façon dont tu termines : un arrêt après un effort calme baisse moins.
          </p>
        </DetailCard>
      )}
    </DetailPage>
  );
}
