// Fenêtres de sommeil : une barre par nuit, du coucher au lever, sur un axe
// horaire (le soir en haut, le matin en bas). Ligne pointillée : coucher
// habituel. Pastille sous la barre : sieste ce jour-là. Rendu serveur, sans JS.

import { formatClock } from "@/lib/sleep";

type Night = {
  date: string;
  bed: number | null; // minutes relatives à minuit du jour du lever (négatif = veille)
  wake: number | null;
  color: string;
  napMin: number;
};

function dayLabel(date: string, short: boolean): string {
  return new Intl.DateTimeFormat("fr-FR", short ? { weekday: "short" } : { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

export function SleepWindowsChart({ nights, usualBed }: { nights: Night[]; usualBed: number | null }) {
  const shown = nights.filter((n) => n.bed != null && n.wake != null);
  if (shown.length === 0) return null;

  // Axe : de l'heure pleine avant le coucher le plus tôt à celle après le lever le plus tard
  const top = Math.floor(Math.min(...shown.map((n) => n.bed!), usualBed ?? Infinity) / 60) * 60;
  const bottom = Math.ceil(Math.max(...shown.map((n) => n.wake!)) / 60) * 60;
  const span = Math.max(60, bottom - top);
  const pos = (m: number) => ((m - top) / span) * 100;
  const hours: number[] = [];
  for (let h = top; h <= bottom; h += span > 8 * 60 ? 120 : 60) hours.push(h);
  const short = nights.length <= 10;
  // Dates affichées : une sur N, et la dernière, sans chevauchement
  const labelEvery = Math.ceil(nights.length / 8);
  const labeled = new Set<number>();
  for (let i = 0; i < nights.length; i += labelEvery) labeled.add(i);
  const lastLabeled = Math.max(...labeled);
  if (nights.length - 1 - lastLabeled < labelEvery / 2) labeled.delete(lastLabeled);
  labeled.add(nights.length - 1);

  return (
    <div className="flex gap-2">
      {/* Graduations horaires */}
      <div className="relative w-10 shrink-0 h-[200px] text-[10px] text-[var(--color-body)] tabular-nums">
        {hours.map((h) => (
          <span key={h} className="absolute right-0 -translate-y-1/2" style={{ top: `${pos(h)}%` }}>
            {formatClock(h)}
          </span>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <div className="relative h-[200px]">
          {hours.map((h) => (
            <div key={h} className="absolute inset-x-0 border-t border-dashed border-black/5 dark:border-white/10" style={{ top: `${pos(h)}%` }} />
          ))}
          {usualBed != null && (
            <div
              className="absolute inset-x-0 border-t-2 border-dashed border-[#5856d6]/50"
              style={{ top: `${pos(usualBed)}%` }}
              title={`Coucher habituel ${formatClock(usualBed)}`}
            />
          )}
          <div className="absolute inset-0 flex gap-[3px]">
            {nights.map((n) => (
              <div key={n.date} className="relative flex-1 min-w-0">
                {n.bed != null && n.wake != null && (
                  <div
                    className="absolute inset-x-0 rounded-[3px]"
                    style={{ top: `${pos(n.bed)}%`, height: `${Math.max(1, pos(n.wake) - pos(n.bed))}%`, backgroundColor: n.color }}
                    title={`${dayLabel(n.date, false)} : ${formatClock(n.bed)} → ${formatClock(n.wake)}${n.napMin > 0 ? ` · sieste ${n.napMin} min` : ""}`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
        {/* Siestes et dates */}
        <div className="flex gap-[3px] mt-1.5">
          {nights.map((n, i) => (
            <div key={n.date} className="flex-1 min-w-0 flex flex-col items-center gap-0.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${n.napMin > 0 ? "bg-[#5856d6]" : "bg-transparent"}`}
                title={n.napMin > 0 ? `Sieste ${n.napMin} min` : undefined}
              />
              <span className="text-[10px] text-[var(--color-body)] truncate">
                {labeled.has(i) ? dayLabel(n.date, short) : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
