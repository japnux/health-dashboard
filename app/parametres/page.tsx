import { SettingsTabs } from "@/components/SettingsTabs";

export const dynamic = "force-dynamic";

export default function ParametresPage() {
  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6 space-y-4">
      <header className="pt-3 pb-1">
        <p className="text-xs uppercase tracking-wide text-[var(--color-body)] font-normal">
          Configuration
        </p>
        <h1 className="text-2xl sm:text-[2rem] font-light tracking-tight text-[var(--color-heading)] dark:text-white" style={{ letterSpacing: "-0.64px" }}>
          Paramètres
        </h1>
      </header>
      <SettingsTabs />
    </main>
  );
}
