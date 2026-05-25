"use client";

import { useCallback, useEffect, useState } from "react";
import { SportigoBookingModal } from "./SportigoBookingModal";
import { ROOM_ACCES_LIBRE, type SportigoUser } from "@/lib/sportigo/types";
import type {
  ActiveReservation,
  ReservationsResponse,
} from "@/lib/sportigo/types";

type Mode = "closed" | "book" | "manage";

const USER_LABEL: Record<SportigoUser, string> = {
  geoffrey: "Geoffrey",
  lauriane: "Lauriane",
};

function formatRange(startIso: string, endIso: string): string {
  const hm = (iso: string) => {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, "0")}h${d
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  };
  return `${hm(startIso)}–${hm(endIso)}`;
}

// Format compact pour la pill du bloc Workout : "16-17h" ou "17h-17h30".
function formatCompactRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const sh = s.getHours();
  const sm = s.getMinutes();
  const eh = e.getHours();
  const em = e.getMinutes();
  const fmt = (h: number, m: number) =>
    m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, "0")}`;
  return `${fmt(sh, sm)}-${fmt(eh, em)}`;
}

export function MusculationBookButton() {
  const [data, setData] = useState<ReservationsResponse | null>(null);
  const [mode, setMode] = useState<Mode>("closed");
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    fetch("/api/sportigo/reservations")
      .then((r) => (r.ok ? (r.json() as Promise<ReservationsResponse>) : null))
      .then((json) => {
        if (json) setData(json);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    function onRefresh() {
      refresh();
    }
    window.addEventListener("sportigo:refresh", onRefresh);
    return () => window.removeEventListener("sportigo:refresh", onRefresh);
  }, [refresh]);

  const bookedUsers = new Set<SportigoUser>();
  if (data) {
    if (data.geoffrey.some((r) => r.roomId === ROOM_ACCES_LIBRE)) bookedUsers.add("geoffrey");
    if (data.lauriane.some((r) => r.roomId === ROOM_ACCES_LIBRE)) bookedUsers.add("lauriane");
  }

  const allReservations: ActiveReservation[] = data
    ? [...data.geoffrey, ...data.lauriane].sort((a, b) => a.start.localeCompare(b.start))
    : [];

  const hasAnyBooking = allReservations.length > 0;

  // Heure de fin de la dernière résa Accès libre du jour (pour filtrer les Reset).
  const existingAccesEnd =
    allReservations
      .filter((r) => r.roomId === ROOM_ACCES_LIBRE)
      .map((r) => r.end)
      .sort()
      .at(-1) ?? null;

  // Map { "<roomId>_<startIso>" : [users] } pour griser les slots déjà bookés.
  const bookedBySlot: Record<string, SportigoUser[]> = {};
  for (const r of allReservations) {
    const key = `${r.roomId}_${r.start}`;
    if (!bookedBySlot[key]) bookedBySlot[key] = [];
    if (!bookedBySlot[key].includes(r.user)) bookedBySlot[key].push(r.user);
  }

  async function handleCancel(r: ActiveReservation) {
    setCancelling((prev) => new Set(prev).add(r.id));
    try {
      const resp = await fetch(`/api/sportigo/reservations/${r.id}`, {
        method: "DELETE",
      });
      if (!resp.ok && resp.status !== 204) throw new Error(`HTTP ${resp.status}`);
      refresh();
      window.dispatchEvent(new CustomEvent("sportigo:refresh"));
    } catch {
      setCancelling((prev) => {
        const next = new Set(prev);
        next.delete(r.id);
        return next;
      });
    }
  }

  function openBook() {
    setMode("book");
  }

  function openManage() {
    setMode("manage");
  }

  // Dédoublonne les réservations par créneau (un même slot booké pour G+L → 1 pill).
  const uniqueSlots = new Map<string, ActiveReservation>();
  for (const r of allReservations) {
    const key = `${r.roomId}_${r.start}`;
    if (!uniqueSlots.has(key)) uniqueSlots.set(key, r);
  }
  const slotPills = Array.from(uniqueSlots.values()).sort((a, b) =>
    a.start.localeCompare(b.start),
  );

  return (
    <>
      {hasAnyBooking ? (
        <div className="inline-flex items-center gap-1 flex-wrap">
          {slotPills.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={openManage}
              className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[#15be53]/40 bg-[#15be53]/10 px-2 py-0.5 text-[11px] text-[#108c3d] hover:bg-[#15be53]/15 transition-colors"
              title="Voir / annuler"
            >
              ✔️{s.roomId === ROOM_ACCES_LIBRE ? "🏋️" : "🥵"}{" "}
              {formatCompactRange(s.start, s.end)}
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={openBook}
          className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] dark:border-white/10 bg-white dark:bg-white/5 px-2 py-0.5 text-[11px] text-[var(--color-label)] dark:text-white/70 hover:border-[var(--color-brand-purple-light)] hover:text-[var(--color-brand-purple)] transition-colors"
        >
          🏋️ Book
        </button>
      )}

      <SportigoBookingModal
        open={mode === "book"}
        onClose={() => setMode("closed")}
        bookedUsers={bookedUsers}
        existingAccesEnd={existingAccesEnd}
        bookedBySlot={bookedBySlot}
        onBooked={() => {
          refresh();
          window.dispatchEvent(new CustomEvent("sportigo:refresh"));
        }}
      />

      {mode === "manage" && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMode("closed");
          }}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md m-4 rounded-[var(--radius-lg)] bg-white dark:bg-[#1a1a1a] border border-[var(--color-border)] dark:border-white/10 p-5"
            style={{ boxShadow: "var(--shadow-ambient)" }}
          >
            <button
              onClick={() => setMode("closed")}
              className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--color-border)]/50 dark:bg-white/10 text-[var(--color-body)] hover:text-[var(--color-heading)] transition-colors"
            >
              ✕
            </button>

            <h2 className="text-sm font-medium text-[var(--color-heading)]">
              Mes réservations
            </h2>
            <p className="text-xs text-[var(--color-body)] mt-0.5">
              Aujourd&apos;hui
            </p>

            <ul className="mt-4 space-y-2">
              {allReservations.map((r) => {
                const isCancelling = cancelling.has(r.id);
                return (
                  <li
                    key={r.id}
                    className={`flex items-center gap-2 text-sm transition-opacity ${
                      isCancelling ? "opacity-30" : "opacity-100"
                    }`}
                  >
                    <span className="text-base leading-none">
                      {r.roomId === ROOM_ACCES_LIBRE ? "🏋️" : "🌿"}
                    </span>
                    <span className="text-[var(--color-heading)]">{r.discipline}</span>
                    <span className="text-xs text-[var(--color-body)]">
                      {formatRange(r.start, r.end)}
                    </span>
                    <span className="text-[10px] text-[var(--color-body)]">
                      · {USER_LABEL[r.user]}
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

            <div className="mt-4">
              <button
                type="button"
                onClick={() => {
                  setMode("closed");
                  setTimeout(() => setMode("book"), 50);
                }}
                className="text-xs text-[var(--color-brand-purple)] hover:underline"
              >
                + Ajouter une séance
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
