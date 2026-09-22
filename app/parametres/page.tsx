import { SettingsTabs } from "@/components/SettingsTabs";
import { logout } from "@/app/login/actions";

export const dynamic = "force-dynamic";

export default function ParametresPage() {
  return (
    <main className="mx-auto max-w-2xl lg:max-w-3xl p-4 sm:p-6 space-y-4">
      <header className="pt-3 pb-1 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--color-body)] font-normal">Configuration</p>
          <h1
            className="text-2xl sm:text-[2rem] font-light tracking-tight text-[var(--color-heading)] dark:text-white"
            style={{ letterSpacing: "-0.64px" }}
          >
            Paramètres
          </h1>
        </div>
        {/* Déconnexion : supprime le cookie de session de cet appareil */}
        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-[var(--color-body)] hover:text-[var(--color-heading)] dark:hover:text-white border border-[var(--color-border)] dark:border-white/10 rounded-[var(--radius-md)] px-3 py-1.5"
          >
            Se déconnecter
          </button>
        </form>
      </header>
      <SettingsTabs />
    </main>
  );
}
