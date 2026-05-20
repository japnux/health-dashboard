export function MissingDataNotice() {
  return (
    <div className="rounded-[var(--radius-md)] bg-[#9b6829]/8 border border-[#9b6829]/20 p-4 text-sm">
      <p className="font-normal text-[#9b6829]">
        Pas encore de données pour aujourd&apos;hui
      </p>
      <p className="text-[var(--color-body)] mt-1">
        Pense à synchroniser tes données Apple Health pour mettre à jour le dashboard.
      </p>
    </div>
  );
}

export function StaleScaleNotice({ ageDays }: { ageDays: number }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[#f97316]/8 border border-[#f97316]/15 p-4 text-sm">
      <p className="font-normal text-[#c2410c]">
        ⚖️ Balance pas synchro depuis {ageDays} jours
      </p>
      <p className="text-[var(--color-body)] mt-1">
        Pèse-toi pour mettre à jour ton objectif protéines.
      </p>
    </div>
  );
}
