"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionToken } from "@/lib/session";

// Connexion par mot de passe unique.
export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "").trim();
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected || password !== expected) {
    redirect("/login?error=mot-de-passe-incorrect");
  }

  const token = sessionToken(expected);
  const cookieStore = await cookies();
  cookieStore.set("hd_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90, // 90 jours
    path: "/",
  });

  redirect("/");
}

// Déconnexion.
export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("hd_session");
  redirect("/login");
}
