// Helper Google Calendar côté serveur.
// Flux : OAuth 2.0 user-delegated. On utilise un refresh_token de longue durée
// stocké en env, qu'on échange contre un access_token à chaque besoin (cache mémoire).

type AccessTokenCacheEntry = { token: string; expiresAt: number };

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

let cached: AccessTokenCacheEntry | null = null;

export class GoogleCalendarNotConfiguredError extends Error {
  constructor() {
    super(
      "Google Calendar non configuré (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN manquants)",
    );
    this.name = "GoogleCalendarNotConfiguredError";
  }
}

function readCreds() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new GoogleCalendarNotConfiguredError();
  }
  return { clientId, clientSecret, refreshToken };
}

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt > now + 30_000) return cached.token;
  const { clientId, clientSecret, refreshToken } = readCreds();
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Google OAuth token refresh failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  const json = (await resp.json()) as {
    access_token: string;
    expires_in: number;
  };
  cached = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return cached.token;
}

export type CalendarEventInput = {
  // ID de l'agenda. "primary" = agenda principal du user du refresh token.
  calendarId?: string;
  summary: string;
  description?: string;
  // ISO local (sans Z), genre "2026-05-25T14:00:00".
  startIsoLocal: string;
  endIsoLocal: string;
  // Adresses email à inviter (l'event est créé sur l'agenda du user du refresh token).
  attendees?: string[];
  location?: string;
  timeZone?: string; // par défaut Europe/Paris
};

export type CalendarEventResult = {
  id: string;
  htmlLink?: string;
};

export async function createCalendarEvent(
  input: CalendarEventInput,
): Promise<CalendarEventResult> {
  const token = await getAccessToken();
  const calendarId = input.calendarId ?? "primary";
  const timeZone = input.timeZone ?? "Europe/Paris";
  const body = {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: { dateTime: input.startIsoLocal, timeZone },
    end: { dateTime: input.endIsoLocal, timeZone },
    attendees: (input.attendees ?? []).map((email) => ({ email })),
  };
  const url = new URL(`${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`);
  // sendUpdates=all → envoie les invits par email aux attendees.
  url.searchParams.set("sendUpdates", "all");
  const resp = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Calendar create event failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  const json = (await resp.json()) as { id: string; htmlLink?: string };
  return { id: json.id, htmlLink: json.htmlLink };
}

export async function deleteCalendarEvent(
  eventId: string,
  calendarId = "primary",
): Promise<void> {
  const token = await getAccessToken();
  const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`;
  const resp = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok && resp.status !== 410) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Calendar delete event failed (${resp.status}): ${text.slice(0, 300)}`);
  }
}
