"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, createSessionToken, safeEqual } from "@/lib/session";

// Limite de tentatives par adresse IP : 5 échecs en 15 minutes bloquent
// 15 minutes. En mémoire (par instance serveur) : suffisant contre un essai
// de mots de passe en rafale sur un dashboard personnel.
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; first: number }>();

function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "inconnue";
}

// Connexion par mot de passe unique.
export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "").trim();
  const expected = process.env.DASHBOARD_PASSWORD;
  const ip = clientIp(await headers());
  const now = Date.now();

  const entry = failures.get(ip);
  if (entry && now - entry.first < WINDOW_MS && entry.count >= MAX_FAILURES) {
    redirect("/login?error=trop-de-tentatives");
  }

  if (!expected || !safeEqual(password, expected)) {
    const fresh = !entry || now - entry.first >= WINDOW_MS;
    failures.set(ip, { count: fresh ? 1 : entry!.count + 1, first: fresh ? now : entry!.first });
    // Petit délai : ralentit les essais en rafale
    await new Promise((r) => setTimeout(r, 800));
    redirect("/login?error=mot-de-passe-incorrect");
  }

  failures.delete(ip);
  const token = createSessionToken();
  if (!token) redirect("/login?error=mot-de-passe-incorrect");
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_S,
    path: "/",
  });

  redirect("/");
}

// Déconnexion.
export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}
