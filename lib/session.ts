// Session du dashboard (mot de passe unique).
//
// Jeton = "<émis à, en secondes>.<signature HMAC>" : il expire, et changer le
// mot de passe invalide toutes les sessions (la clé de signature en dépend).
// Avant : un hash fixe du mot de passe, valable indéfiniment une fois volé.

import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "hd_session";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 90; // 90 jours

// Clé de signature côté serveur : mot de passe + secret serveur. SESSION_SECRET
// si défini, sinon la clé service Supabase (jamais exposée au navigateur).
function signingKey(): string | null {
  const password = process.env.DASHBOARD_PASSWORD;
  const secret = process.env.SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!password) return null;
  return createHash("sha256").update(`${password}:${secret}:hd-session-v2`).digest("hex");
}

function sign(issuedAt: string, key: string): string {
  return createHmac("sha256", key).update(issuedAt).digest("hex");
}

/** Comparaison à temps constant (longueurs égalisées par hachage). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function createSessionToken(): string | null {
  const key = signingKey();
  if (!key) return null;
  const issuedAt = String(Math.floor(Date.now() / 1000));
  return `${issuedAt}.${sign(issuedAt, key)}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  const key = signingKey();
  if (!key || !token) return false;
  const [issuedAt, signature] = token.split(".");
  if (!issuedAt || !signature || !/^\d+$/.test(issuedAt)) return false;
  const age = Math.floor(Date.now() / 1000) - Number(issuedAt);
  if (age < 0 || age > SESSION_MAX_AGE_S) return false;
  return safeEqual(signature, sign(issuedAt, key));
}

/** Contrôle unique de session pour les routes API et les pages serveur. */
export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}
