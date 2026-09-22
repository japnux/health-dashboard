import type { CSSProperties } from "react";
import { VIVID, TEXT, tint, tintedBackground } from "@/lib/palette";

// Le texte coloré passe par une variable CSS : couleur TEXT en mode clair,
// teinte plus lumineuse en mode sombre (lisible sur fond foncé)
function textVar(hex: string): CSSProperties {
  return { "--notice-text": hex } as CSSProperties;
}

// Alerte : données du jour absentes (teinte orange)
export function MissingDataNotice() {
  return (
    <div
      className="rounded-[var(--radius-md)] border p-4 text-sm"
      style={{ background: tintedBackground(VIVID.orange), borderColor: tint(VIVID.orange, 0.25) }}
    >
      <p
        className="font-medium text-[var(--notice-text)] dark:text-[#ffb340]"
        style={textVar(TEXT.orange)}
      >
        Pas encore de données pour aujourd&apos;hui
      </p>
      <p className="text-[var(--color-body)] mt-1">
        Pense à synchroniser tes données Apple Health pour mettre à jour le tableau de bord.
      </p>
    </div>
  );
}

// Alerte générique teintée : orange (à surveiller) ou rouge (inhabituel)
export function AlertNotice({ tone, title, children }: { tone: "orange" | "red"; title: string; children?: React.ReactNode }) {
  const color = tone === "red" ? VIVID.red : VIVID.orange;
  return (
    <div
      className="rounded-[var(--radius-md)] border p-4 text-sm"
      style={{ background: tintedBackground(color), borderColor: tint(color, 0.25) }}
    >
      <p
        className={`font-medium text-[var(--notice-text)] ${tone === "red" ? "dark:text-[#ff8a80]" : "dark:text-[#ffb340]"}`}
        style={textVar(tone === "red" ? TEXT.red : TEXT.orange)}
      >
        {title}
      </p>
      {children && <p className="text-[var(--color-body)] mt-1">{children}</p>}
    </div>
  );
}

// Rappel : balance non synchronisée depuis plusieurs jours (orange : ce
// n'est pas une alerte santé)
export function StaleScaleNotice({ ageDays }: { ageDays: number }) {
  return (
    <div
      className="rounded-[var(--radius-md)] border p-4 text-sm"
      style={{ background: tintedBackground(VIVID.orange), borderColor: tint(VIVID.orange, 0.25) }}
    >
      <p
        className="font-medium text-[var(--notice-text)] dark:text-[#ffb340]"
        style={textVar(TEXT.orange)}
      >
        Balance pas synchro depuis {ageDays} jours
      </p>
      <p className="text-[var(--color-body)] mt-1">
        Pèse-toi pour continuer à suivre ta composition corporelle.
      </p>
    </div>
  );
}
