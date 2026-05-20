import { login } from "./actions";

type Search = Promise<{ error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const params = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div
        className="w-full max-w-sm bg-white dark:bg-white/5 rounded-[var(--radius-lg)] border border-[var(--color-border)] dark:border-white/10 p-6"
        style={{ boxShadow: "var(--shadow-elevated)" }}
      >
        <h1 className="text-xl font-light text-[var(--color-heading)] dark:text-white mb-1" style={{ letterSpacing: "-0.22px" }}>
          Health Dashboard
        </h1>
        <p className="text-sm text-[var(--color-body)] mb-6">Accès protégé.</p>

        <form action={login} className="space-y-3">
          <input
            name="password"
            type="password"
            required
            placeholder="Mot de passe"
            autoComplete="current-password"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] dark:border-white/10 bg-transparent px-3 py-2 text-[var(--color-heading)] dark:text-white outline-none focus:border-[var(--color-brand-purple)] placeholder:text-[var(--color-body)]"
          />
          <button
            type="submit"
            className="w-full rounded-[var(--radius-sm)] bg-[var(--color-brand-purple)] text-white py-2 text-sm font-normal hover:bg-[var(--color-brand-purple-hover)] transition-colors"
          >
            Entrer
          </button>
          {params.error && (
            <p className="text-xs text-[#ea2261]">{params.error}</p>
          )}
        </form>
      </div>
    </main>
  );
}
