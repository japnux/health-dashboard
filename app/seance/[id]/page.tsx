// Page de détail d'une séance : chiffres clés comparés aux séances du même
// type sur 30 jours, et répartition du temps par zone de fréquence cardiaque.

import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserTz } from "@/lib/user-tz";
import { normalizeWorkoutType, workoutDisplayLabel } from "@/lib/workout-types";
import { HR_ZONES } from "@/lib/hr-zones";
import { BackLink, DetailCard, DetailPage, Delta, StatGrid } from "@/components/detail/DetailBits";

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
  const [{ data: w }, tz] = await Promise.all([
    supabase.from("workouts").select("*").eq("id", id).maybeSingle(),
    getUserTz(supabase),
  ]);
  if (!w) notFound();

  // Séances du même type sur les 30 jours précédents (hors celle-ci)
  const typeKey = normalizeWorkoutType(w.type ?? "");
  const from = new Date(new Date(w.started_at).getTime() - 30 * 86_400_000).toISOString();
  const { data: others } = await supabase
    .from("workouts")
    .select("type, duration_min, kcal, avg_hr_bpm, cardio_load")
    .gte("started_at", from)
    .lt("started_at", w.started_at);
  const same = (others ?? []).filter((o) => normalizeWorkoutType(o.type ?? "") === typeKey);

  const ref = {
    duration: mean(same.map((o) => o.duration_min)),
    load: mean(same.map((o) => (o.cardio_load != null ? Number(o.cardio_load) : null))),
    hr: mean(same.map((o) => o.avg_hr_bpm)),
    kcal: mean(same.map((o) => o.kcal)),
  };
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
              Temps passé au-dessus de 50 % de ta FC max : {fmtDuration(zoneTotal)}. La courbe de fréquence cardiaque de la
              séance arrivera prochainement.
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-body)]">Pas de fréquence cardiaque minute par minute pour cette séance.</p>
        )}
      </DetailCard>
    </DetailPage>
  );
}
