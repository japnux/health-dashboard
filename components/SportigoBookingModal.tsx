"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  BookResponse,
  PlanningResponse,
  PlanningSlot,
  SportigoUser,
} from "@/lib/sportigo/types";

type UserChoice = "geoffrey" | "lauriane" | "both";

const USER_LABELS: Record<SportigoUser, string> = {
  geoffrey: "Geoffrey",
  lauriane: "Lauriane",
};

function formatHour(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}h${m}`;
}

function todayLong(): string {
  return new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function todayISO(): string {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60_000;
  const local = new Date(now.getTime() - tzOffset);
  return local.toISOString().slice(0, 10);
}

type Props = {
  open: boolean;
  onClose: () => void;
  bookedUsers: Set<SportigoUser>;
  onBooked: () => void;
};

// On wrappe le contenu dans un composant interne monté uniquement quand open=true,
// pour réinitialiser proprement l'état à chaque ouverture sans useEffect de reset.
export function SportigoBookingModal(props: Props) {
  if (!props.open) return null;
  return <ModalContent {...props} />;
}

function defaultUserChoice(bookedUsers: Set<SportigoUser>): UserChoice {
  const hasG = bookedUsers.has("geoffrey");
  const hasL = bookedUsers.has("lauriane");
  if (hasG && !hasL) return "lauriane";
  if (!hasG && hasL) return "geoffrey";
  return "both";
}

function ModalContent({ onClose, bookedUsers, onBooked }: Props) {
  const [planning, setPlanning] = useState<PlanningResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedAccess, setSelectedAccess] = useState<PlanningSlot | null>(null);
  const [includeReset, setIncludeReset] = useState(true);
  const [userChoice, setUserChoice] = useState<UserChoice>(() => defaultUserChoice(bookedUsers));
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [partial, setPartial] = useState<BookResponse | null>(null);

  // Fetch planning au mount (le composant n'est monté que quand la modal s'ouvre).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sportigo/planning?date=${todayISO()}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.message || body.error || `HTTP ${r.status}`);
        }
        return r.json() as Promise<PlanningResponse>;
      })
      .then((data) => {
        if (!cancelled) setPlanning(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Calcule le créneau Reset proposé pour le slot accès libre choisi (premier reset à >= fin du créneau).
  const suggestedReset = useMemo(() => {
    if (!selectedAccess || !planning) return null;
    const candidates = planning.reset
      .filter((r) => !r.full && new Date(r.start).getTime() >= new Date(selectedAccess.end).getTime())
      .sort((a, b) => a.start.localeCompare(b.start));
    return candidates[0] ?? null;
  }, [selectedAccess, planning]);

  const usersFromChoice: SportigoUser[] = useMemo(() => {
    if (userChoice === "both") return ["geoffrey", "lauriane"];
    return [userChoice];
  }, [userChoice]);

  // Conflit : un user déjà réservé.
  const usersAfterFilter = useMemo(
    () => usersFromChoice.filter((u) => !bookedUsers.has(u)),
    [usersFromChoice, bookedUsers],
  );

  const conflict = usersFromChoice.length > 0 && usersAfterFilter.length === 0;
  const partialConflict =
    usersFromChoice.length > usersAfterFilter.length && usersAfterFilter.length > 0;

  const needed = usersAfterFilter.length;
  const remaining = selectedAccess
    ? Math.max(0, selectedAccess.capacity - selectedAccess.booked)
    : 0;
  const notEnoughSeats = selectedAccess != null && needed > 0 && remaining < needed;

  const canSubmit =
    !submitting && !loading && selectedAccess != null && needed > 0 && !notEnoughSeats;

  async function handleSubmit() {
    if (!selectedAccess) return;
    setSubmitting(true);
    setToast(null);
    setPartial(null);
    try {
      const reset = includeReset && suggestedReset ? suggestedReset : null;
      const resp = await fetch("/api/sportigo/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          users: usersAfterFilter,
          eventId: selectedAccess.eventId,
          roomId: selectedAccess.roomId,
          dateLesson: selectedAccess.start,
          discipline: selectedAccess.discipline || "Accès libre",
          activity: selectedAccess.activity,
          alsoBookReset: reset
            ? {
                eventId: reset.eventId,
                roomId: reset.roomId,
                dateLesson: reset.start,
                activity: reset.activity,
              }
            : undefined,
          resetDiscipline: reset?.discipline,
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as BookResponse;
      const allOk = data.results.every(
        (r) => r.accesLibre.ok && (!r.reset || r.reset.ok),
      );
      onBooked();
      if (allOk) {
        onClose();
      } else {
        setPartial(data);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      setToast(`Réservation échouée · ${message}`);
      setTimeout(() => setToast(null), 5000);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4 rounded-[var(--radius-lg)] bg-white dark:bg-[#1a1a1a] border border-[var(--color-border)] dark:border-white/10 p-5"
        style={{ boxShadow: "var(--shadow-ambient)" }}
      >
        <button
          onClick={onClose}
          disabled={submitting}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--color-border)]/50 dark:bg-white/10 text-[var(--color-body)] hover:text-[var(--color-heading)] transition-colors disabled:opacity-50"
        >
          ✕
        </button>

        <h2 className="text-sm font-medium text-[var(--color-heading)]">
          Réserver — Musculation
        </h2>
        <p className="text-xs text-[var(--color-body)] mt-0.5 capitalize">
          Aujourd&apos;hui · {todayLong()}
        </p>

        {/* Sélecteur user */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {(["geoffrey", "lauriane", "both"] as UserChoice[]).map((opt) => {
            const active = userChoice === opt;
            const label =
              opt === "both" ? "Les deux" : USER_LABELS[opt as SportigoUser];
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setUserChoice(opt)}
                disabled={submitting}
                className={`inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
                  active
                    ? "border-[var(--color-brand-purple)]/40 bg-[var(--color-brand-purple)]/5 text-[var(--color-brand-purple)]"
                    : "border-[var(--color-border)] dark:border-white/10 bg-white dark:bg-white/5 text-[var(--color-label)] dark:text-white/70 hover:border-[var(--color-brand-purple-light)] hover:text-[var(--color-brand-purple)]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {conflict && (
          <p className="mt-2 text-xs text-[#ea2261]">
            Déjà réservé pour {usersFromChoice.map((u) => USER_LABELS[u]).join(" et ")} aujourd&apos;hui.
          </p>
        )}
        {partialConflict && !conflict && (
          <p className="mt-2 text-xs text-[var(--color-body)]">
            Certain·e·s ont déjà une résa, on bookera uniquement{" "}
            {usersAfterFilter.map((u) => USER_LABELS[u]).join(", ")}.
          </p>
        )}

        {/* Corps */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Colonne gauche : Accès libre */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[var(--color-body)] mb-2">
              🏋️ Accès libre · choisis ton créneau
            </p>
            {loading && (
              <div className="space-y-2">
                <div className="h-7 rounded bg-[var(--color-border)]/30 dark:bg-white/5 animate-pulse" />
                <div className="h-7 rounded bg-[var(--color-border)]/30 dark:bg-white/5 animate-pulse" />
                <div className="h-7 rounded bg-[var(--color-border)]/30 dark:bg-white/5 animate-pulse" />
              </div>
            )}
            {loadError && (
              <p className="text-xs text-[#ea2261]">{loadError}</p>
            )}
            {!loading && !loadError && planning && planning.accesLibre.length === 0 && (
              <p className="text-xs text-[var(--color-body)]">Aucun créneau aujourd&apos;hui.</p>
            )}
            <div className="space-y-1">
              {planning?.accesLibre.map((slot) => {
                const isSelected = selectedAccess?.eventId === slot.eventId;
                const free = Math.max(0, slot.capacity - slot.booked);
                return (
                  <button
                    key={slot.eventId}
                    type="button"
                    disabled={slot.full || submitting}
                    onClick={() => setSelectedAccess(slot)}
                    className={`w-full flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                      isSelected
                        ? "border-[var(--color-brand-purple)]/60 bg-[var(--color-brand-purple)]/10 text-[var(--color-brand-purple)]"
                        : slot.full
                        ? "border-[var(--color-border)] dark:border-white/10 text-[var(--color-body)]"
                        : "border-[var(--color-border)] dark:border-white/10 bg-white dark:bg-white/5 text-[var(--color-label)] dark:text-white/70 hover:border-[var(--color-brand-purple-light)] hover:text-[var(--color-brand-purple)]"
                    }`}
                  >
                    <span>
                      {formatHour(slot.start)} – {formatHour(slot.end)}
                    </span>
                    {slot.full ? (
                      <span className="text-[10px] uppercase tracking-wide">Complet</span>
                    ) : (
                      <span className="text-[10px]">
                        {slot.booked}/{slot.capacity}
                        {free > 0 && (
                          <span className="ml-1 text-[var(--color-body)]">· {free} libre{free > 1 ? "s" : ""}</span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Colonne droite : Reset */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[var(--color-body)] mb-2">
              🌿 The Reset · auto à +1h
            </p>
            {!selectedAccess && (
              <p className="text-xs text-[var(--color-body)]">
                Sélectionne un créneau Accès libre.
              </p>
            )}
            {selectedAccess && !suggestedReset && (
              <p className="text-xs text-[var(--color-body)]">
                Pas de Reset disponible à cette heure.
              </p>
            )}
            {selectedAccess && suggestedReset && (
              <label className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] dark:border-white/10 bg-white dark:bg-white/5 px-2.5 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeReset}
                  onChange={(e) => setIncludeReset(e.target.checked)}
                  disabled={submitting}
                  className="mt-0.5"
                />
                <span className="text-xs">
                  <span className="block text-[var(--color-heading)]">
                    {suggestedReset.discipline || "The Reset"} · {formatHour(suggestedReset.start)}–
                    {formatHour(suggestedReset.end)}
                  </span>
                  <span className="block text-[10px] text-[var(--color-body)] mt-0.5">
                    {Math.max(0, suggestedReset.capacity - suggestedReset.booked)}/
                    {suggestedReset.capacity} place
                    {suggestedReset.capacity > 1 ? "s" : ""} dispo
                  </span>
                </span>
              </label>
            )}
          </div>
        </div>

        {notEnoughSeats && (
          <p className="mt-3 text-xs text-[#ea2261]">
            Pas assez de places pour {needed} personne{needed > 1 ? "s" : ""} sur ce créneau ({remaining} dispo).
          </p>
        )}

        {partial && (
          <div className="mt-3 text-xs space-y-1">
            {partial.results.map((r) => (
              <p key={r.user}>
                <span className="font-medium">{USER_LABELS[r.user]}</span>{" "}
                · Accès libre :{" "}
                {r.accesLibre.ok ? (
                  <span className="text-[#15be53]">ok</span>
                ) : (
                  <span className="text-[#ea2261]">{r.accesLibre.error}</span>
                )}
                {r.reset && (
                  <>
                    {" "}· Reset :{" "}
                    {r.reset.ok ? (
                      <span className="text-[#15be53]">ok</span>
                    ) : (
                      <span className="text-[#ea2261]">{r.reset.error}</span>
                    )}
                  </>
                )}
              </p>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-xs text-[var(--color-body)] px-3 py-1.5 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-brand-purple)]/40 bg-[var(--color-brand-purple)]/10 px-3 py-1.5 text-xs text-[var(--color-brand-purple)] hover:bg-[var(--color-brand-purple)]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-[var(--color-brand-purple)]/30 border-t-[var(--color-brand-purple)] rounded-full animate-spin" />
                Réservation…
              </>
            ) : (
              <>Réserver →</>
            )}
          </button>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] rounded-[var(--radius-sm)] bg-[#ea2261] text-white px-3 py-2 text-xs shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
