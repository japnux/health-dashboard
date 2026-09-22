"use client";

// Retour vers la page d'où l'on vient (Stats, Strain…) quand elle fait partie
// du dashboard ; sinon (lien ouvert directement), vers l'accueil.

import Link from "next/link";
import { useRouter } from "next/navigation";

export function BackButton({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <Link
      href={fallback}
      onClick={(e) => {
        const fromDashboard =
          typeof document !== "undefined" && document.referrer.startsWith(window.location.origin) && window.history.length > 1;
        if (fromDashboard) {
          e.preventDefault();
          router.back();
        }
      }}
      className="inline-flex items-center gap-1 text-sm text-[var(--color-body)] hover:text-[var(--color-heading)] dark:hover:text-white"
    >
      ‹ Retour
    </Link>
  );
}
