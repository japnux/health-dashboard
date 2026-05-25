"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ActiveReservation,
  ReservationsResponse,
  SportigoUser,
} from "@/lib/sportigo/types";
import { ROOM_ACCES_LIBRE, ROOM_THE_RESET } from "@/lib/sportigo/types";

const USER_BADGE: Record<
  SportigoUser,
  { label: string; bg: string; text: string }
> = {
  geoffrey: {
    label: "G",
    bg: "bg-[var(--color-brand-purple)]/10",
    text: "text-[var(--color-brand-purple)]",
  },
  lauriane: {
    label: "L",
    bg: "bg-[#15be53]/10",
    text: "text-[#108c3d]",
  },
};

function disciplineEmoji(roomId: number, fallback?: string): string {
  if (roomId === ROOM_ACCES_LIBRE) return "🏋️";
  if (roomId === ROOM_THE_RESET) return "🌿";
  if (fallback?.toLowerCase().includes("reset")) return "🌿";
  return "🏋️";
}

function formatShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}

function formatRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const hm = (d: Date) =>
    `${d.getHours().toString().padStart(2, "0")}h${d.getMinutes().toString().padStart(2, "0")}`;
  return `${hm(s)}–${hm(e)}`;
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ReservationsResponse };

export function Reservations() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    fetch("/api/sportigo/reservations")
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.message || body.error || `HTTP ${r.status}`);
        }
        return r.json() as Promise<ReservationsResponse>;
      })
      .then((data) => setState({ status: "ready", data }))
      .catch((err) => setState({ status: "error", message: err.message }));
  }, []);

  useEffect(() => {
    refresh();
    function onRefresh() {
      refresh();
    }
    window.addEventListener("sportigo:refresh", onRefresh);
    return () => window.removeEventListener("sportigo:refresh", onRefresh);
  }, [refresh]);

  async function handleCancel(reservation: ActiveReservation) {
    setCancelling((prev) => new Set(prev).add(reservation.id));
    try {
      const resp = await fetch(`/api/sportigo/reservations/${reservation.id}`, {
        method: "DELETE",
      });
      if (!resp.ok && resp.status !== 204) {
        throw new Error(`HTTP ${resp.status}`);
      }
      refresh();
      // Notifier les autres composants (PlannedActivities).
      window.dispatchEvent(new CustomEvent("sportigo:refresh"));
    } catch (err) {
      console.error("[Reservations] annulation:", err);
      setCancelling((prev) => {
        const next = new Set(prev);
        next.delete(reservation.id);
        return next;
      });
    }
  }

  return (
    <section
      className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5"
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <h2 className="text-xs uppercase tracking-wide text-[var(--color-body)] font-normal mb-3">
        Réservations
      </h2>

      {state.status === "loading" && (
        <div className="space-y-2">
          <div className="h-6 rounded bg-[var(--color-border)]/30 dark:bg-white/5 animate-pulse" />
          <div className="h-6 rounded bg-[var(--color-border)]/30 dark:bg-white/5 animate-pulse" />
        </div>
      )}

      {state.status === "error" && (
        <p className="text-sm text-[#ea2261]">{state.message}</p>
      )}

      {state.status === "ready" && (() => {
        const all = [...state.data.geoffrey, ...state.data.lauriane].sort((a, b) =>
          a.start.localeCompare(b.start),
        );
        if (all.length === 0) {
          return (
            <p className="text-sm text-[var(--color-body)]">Aucune séance réservée</p>
          );
        }
        return (
          <ul className="space-y-1.5">
            {all.map((r) => {
              const badge = USER_BADGE[r.user];
              const isCancelling = cancelling.has(r.id);
              return (
                <li
                  key={r.id}
                  className={`flex items-center gap-2 text-sm transition-opacity ${
                    isCancelling ? "opacity-30" : "opacity-100"
                  }`}
                >
                  <span className="text-base leading-none">
                    {disciplineEmoji(r.roomId, r.discipline)}
                  </span>
                  <span className="text-[var(--color-heading)] flex-shrink-0">
                    {r.discipline}
                  </span>
                  <span className="text-[var(--color-body)] text-xs capitalize">
                    {formatShort(r.start)} · {formatRange(r.start, r.end)}
                  </span>
                  <span
                    className={`text-[10px] font-medium rounded-full w-4 h-4 flex items-center justify-center ${badge.bg} ${badge.text}`}
                    title={r.user}
                  >
                    {badge.label}
                  </span>
                  <button
                    type="button"
                    disabled={isCancelling}
                    onClick={() => handleCancel(r)}
                    className="ml-auto text-xs text-[#ea2261] hover:underline disabled:opacity-50"
                  >
                    Annuler
                  </button>
                </li>
              );
            })}
          </ul>
        );
      })()}
    </section>
  );
}
