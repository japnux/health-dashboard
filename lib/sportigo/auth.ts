// Cache mémoire process-level pour les appToken Sportigo.
// En dev (Next reload) le module est ré-évalué et le cache est repeuplé via login.
// En prod (Vercel Fluid Compute), le cache vit le temps de l'instance.

import { loginSportigo, SportigoAuthError } from "./client";
import type { SportigoUser } from "./types";

type TokenCacheEntry = {
  appToken: string;
  memberId?: string;
  expiresAt: number; // ms epoch
};

const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 min — l'API Sportigo ne documente pas son TTL exact

const cache = new Map<SportigoUser, TokenCacheEntry>();

async function loadEntry(user: SportigoUser): Promise<TokenCacheEntry> {
  const { appToken, memberId } = await loginSportigo(user);
  const entry: TokenCacheEntry = {
    appToken,
    memberId,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  };
  cache.set(user, entry);
  return entry;
}

export async function getAppToken(user: SportigoUser, forceRefresh = false): Promise<string> {
  const now = Date.now();
  const entry = cache.get(user);
  if (!forceRefresh && entry && entry.expiresAt > now) {
    return entry.appToken;
  }
  const fresh = await loadEntry(user);
  return fresh.appToken;
}

export async function getSession(
  user: SportigoUser,
  forceRefresh = false,
): Promise<TokenCacheEntry> {
  const now = Date.now();
  const entry = cache.get(user);
  if (!forceRefresh && entry && entry.expiresAt > now) return entry;
  return loadEntry(user);
}

// Wrapper utilitaire : tente l'opération, sur 401 invalide le cache et retente une fois.
export async function withAppToken<T>(
  user: SportigoUser,
  op: (appToken: string) => Promise<T>,
): Promise<T> {
  let token = await getAppToken(user);
  try {
    return await op(token);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401 || err instanceof SportigoAuthError) {
      cache.delete(user);
      token = await getAppToken(user, true);
      return op(token);
    }
    throw err;
  }
}

export async function withSession<T>(
  user: SportigoUser,
  op: (session: TokenCacheEntry) => Promise<T>,
): Promise<T> {
  let session = await getSession(user);
  try {
    return await op(session);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401 || err instanceof SportigoAuthError) {
      cache.delete(user);
      session = await getSession(user, true);
      return op(session);
    }
    throw err;
  }
}

export function clearTokenCache(user?: SportigoUser) {
  if (user) cache.delete(user);
  else cache.clear();
}
