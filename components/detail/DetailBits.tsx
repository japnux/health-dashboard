// Briques communes des pages de détail (récupération, forme, séance,
// mesures, sommeil) : même en-tête, mêmes cartes, même choix de période.

import Link from "next/link";

export function DetailPage({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-2xl p-4 pb-24 sm:p-6 space-y-5">{children}</main>;
}

export function BackLink({ href = "/", label = "Accueil" }: { href?: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-[var(--color-body)] hover:text-[var(--color-heading)] dark:hover:text-white"
    >
      ‹ {label}
    </Link>
  );
}

// En-tête : sur-titre, grand chiffre, statut (pastille + libellé), date, conseil
export function DetailHeader({
  eyebrow,
  value,
  unit,
  status,
  date,
  advice,
}: {
  eyebrow: string;
  value: string;
  unit?: string;
  status?: { color: string; label: string } | null;
  date?: string | null;
  advice?: string | null;
}) {
  return (
    <header>
      <p className="text-xs uppercase tracking-wide text-[var(--color-body)]">{eyebrow}</p>
      <p className="mt-2 text-[var(--color-heading)] dark:text-white">
        <span className="text-6xl font-light">{value}</span>
        {unit && <span className="text-xl font-light text-[var(--color-body)] ml-1.5">{unit}</span>}
      </p>
      {status && (
        <p className="flex items-center gap-1.5 mt-2 text-xs uppercase tracking-wide text-[var(--color-heading)] dark:text-white">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.color }} />
          {status.label}
        </p>
      )}
      {date && <p className="text-sm text-[var(--color-body)] mt-1">{date}</p>}
      {advice && <p className="text-base text-[var(--color-heading)] dark:text-white mt-4 leading-relaxed">{advice}</p>}
    </header>
  );
}

export function DetailCard({ title, right, children }: { title?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section
      className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      {(title || right) && (
        <div className="flex items-center justify-between mb-3 gap-3">
          {title && <p className="text-xs uppercase tracking-wide text-[var(--color-body)]">{title}</p>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

// Choix de période par liens (?p=7|30|90) : pas de JavaScript nécessaire
export function PeriodSwitch({ base, current, periods = [7, 30, 90] }: { base: string; current: number; periods?: number[] }) {
  return (
    <div className="flex gap-1 rounded-[var(--radius-md)] bg-[var(--color-border)]/30 dark:bg-white/5 p-1">
      {periods.map((p) => (
        <Link
          key={p}
          href={`${base}?p=${p}`}
          className={`text-xs px-2.5 py-1 rounded-[var(--radius-sm)] ${
            p === current
              ? "bg-white dark:bg-white/10 text-[var(--color-heading)] dark:text-white shadow-sm"
              : "text-[var(--color-body)] hover:text-[var(--color-heading)]"
          }`}
        >
          {p} j
        </Link>
      ))}
    </div>
  );
}

export function parsePeriod(raw: string | string[] | undefined, allowed = [7, 30, 90], fallback = 30): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return allowed.includes(n) ? n : fallback;
}

// Grille de chiffres : libellé, valeur, sous-titre (comparaison, zone…)
export function StatGrid({
  items,
  cols = 3,
}: {
  items: { label: string; value: string; sub?: React.ReactNode }[];
  cols?: 2 | 3 | 4;
}) {
  const grid = cols === 2 ? "grid-cols-2" : cols === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3";
  return (
    <div className={`grid ${grid} gap-x-3 gap-y-4`}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <p className="text-xs text-[var(--color-body)]">{i.label}</p>
          <p className="text-xl font-light tabular-nums text-[var(--color-heading)] dark:text-white">{i.value}</p>
          {i.sub && <div className="text-[11px] text-[var(--color-body)] mt-0.5">{i.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// Écart vs une référence : flèche + valeur, vert si favorable, rouge sinon
export function Delta({ diff, betterWhen, format }: { diff: number | null; betterWhen: "up" | "down" | "none"; format: (v: number) => string }) {
  if (diff == null || Math.abs(diff) < 1e-9) return <span>= moyenne</span>;
  const up = diff > 0;
  const color =
    betterWhen === "none" ? "text-[var(--color-body)]" : (betterWhen === "up") === up ? "text-[#108c3d]" : "text-[#c2410c]";
  return (
    <span className={color}>
      {up ? "▲" : "▼"} {format(Math.abs(diff))}
    </span>
  );
}

export function formatLongDate(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
