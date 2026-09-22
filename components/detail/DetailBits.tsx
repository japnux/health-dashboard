// Briques communes des pages de détail (récupération, forme, séance,
// mesures, sommeil) : même en-tête, mêmes cartes, même choix de période.

import Link from "next/link";
import { tintedBackground, tint } from "@/lib/palette";
import { BackButton } from "@/components/detail/BackButton";

export function DetailPage({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-2xl p-4 pb-24 sm:p-6 space-y-5">{children}</main>;
}

// Retour vers la page précédente du dashboard (accueil par défaut)
export function BackLink({ href = "/" }: { href?: string }) {
  return <BackButton fallback={href} />;
}

// En-tête : sur-titre, grand chiffre, statut (pastille + libellé), date, conseil.
// Carte teintée par la couleur du statut (ou `accent`), comme l'app de référence.
export function DetailHeader({
  eyebrow,
  value,
  unit,
  status,
  date,
  advice,
  accent,
  children,
}: {
  accent?: string;
  children?: React.ReactNode;
  eyebrow: string;
  value: string;
  unit?: string;
  status?: { color: string; label: string } | null;
  date?: string | null;
  advice?: string | null;
}) {
  const color = accent ?? status?.color ?? null;
  return (
    <header
      className={color ? "rounded-[var(--radius-lg)] border p-5 sm:p-6" : undefined}
      style={color ? { background: tintedBackground(color), borderColor: tint(color, 0.3) } : undefined}
    >
      <p className="text-xs uppercase tracking-wide text-[var(--color-body)]">{eyebrow}</p>
      <p className="mt-2 text-[var(--color-heading)] dark:text-white">
        <span className="text-6xl font-light">{value}</span>
        {unit && <span className="text-xl font-light text-[var(--color-body)] ml-1.5">{unit}</span>}
      </p>
      {status && (
        <p className="flex items-center gap-1.5 mt-2 text-xs uppercase tracking-wide text-[var(--color-heading)] dark:text-white">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: status.color, boxShadow: `0 0 0 3px ${tint(status.color, 0.25)}` }}
          />
          {status.label}
        </p>
      )}
      {date && <p className="text-sm text-[var(--color-body)] mt-1">{date}</p>}
      {advice && <p className="text-base text-[var(--color-heading)] dark:text-white mt-4 leading-relaxed">{advice}</p>}
      {children}
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
          // Garde la position de scroll et ne remplit pas l'historique à chaque changement de période
          scroll={false}
          replace
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
    <div className={`grid ${grid} gap-2 sm:gap-3`}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0 rounded-[var(--radius-md)] bg-[#061b31]/[0.04] dark:bg-white/[0.06] px-3 py-2.5">
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
  const pill = "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 tabular-nums";
  if (diff == null || Math.abs(diff) < 1e-9) return <span className={`${pill} bg-[#061b31]/[0.06] dark:bg-white/10`}>= moyenne</span>;
  const up = diff > 0;
  const tone =
    betterWhen === "none"
      ? "bg-[#061b31]/[0.06] dark:bg-white/10 text-[var(--color-heading)] dark:text-white"
      : (betterWhen === "up") === up
        ? "bg-[#34c759]/15 text-[#1f7a3a] dark:text-[#6ee7a0]"
        : "bg-[#ff3b30]/15 text-[#c0271e] dark:text-[#ff8a80]";
  return (
    <span className={`${pill} ${tone}`}>
      {up ? "▲" : "▼"} {format(Math.abs(diff))}
    </span>
  );
}

export function formatLongDate(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
