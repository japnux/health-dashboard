"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Accueil", emoji: "🏠️" },
  { href: "/nutrition", label: "Nutrition", emoji: "🥑" },
  { href: "/biologie", label: "Biologie", emoji: "🧬" },
  { href: "/stats", label: "Stats", emoji: "📈" },
  { href: "/parametres", label: "Paramètres", emoji: "⚙️" },
] as const;

export function NavBar() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <nav className="sticky top-0 z-40 bg-white/80 dark:bg-[#0d1520]/80 backdrop-blur-sm border-b border-[var(--color-border)] dark:border-white/10">
      <div className="mx-auto max-w-2xl flex items-center justify-center px-4 py-2 sm:py-3">
        <div className="flex items-center gap-1">
          {links.map((l) => {
            const active =
              l.href === "/"
                ? pathname === "/"
                : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-normal transition-colors ${
                  active
                    ? "bg-[var(--color-brand-purple)] text-white"
                    : "text-[var(--color-heading)] dark:text-white/80 hover:text-[var(--color-brand-purple)]"
                }`}
              >
                <span className="sm:hidden text-base">{l.emoji}</span>
                <span className="hidden sm:inline">{l.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
