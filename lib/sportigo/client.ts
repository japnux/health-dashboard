// Client HTTP minimal pour l'API Sportigo (salle Novarc).
// Toute communication passe par le proxy `https://novarc.sportigo.club/api/sportigo/service/`
// qui prend en POST un body `{ url, method, data, appToken }` et relaie vers le backend Sportigo.
// L'endpoint login `/api/auth/login` est appelé en direct (non proxifié).

import type { SportigoUser } from "./types";

const SERVICE_URL = "https://novarc.sportigo.club/api/sportigo/service/";
const LOGIN_URL = "https://novarc.sportigo.club/api/auth/login";

export class SportigoAuthError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "SportigoAuthError";
  }
}

export class SportigoApiError extends Error {
  constructor(message: string, public status?: number, public payload?: unknown) {
    super(message);
    this.name = "SportigoApiError";
  }
}

export class SportigoNotConfiguredError extends Error {
  constructor(user: SportigoUser) {
    super(`Credentials Sportigo manquants pour ${user} (SPORTIGO_EMAIL_${user.toUpperCase()} / SPORTIGO_PASSWORD_${user.toUpperCase()})`);
    this.name = "SportigoNotConfiguredError";
  }
}

type Credentials = { email: string; password: string };

function readCredentials(user: SportigoUser): Credentials {
  const upper = user.toUpperCase();
  const email = process.env[`SPORTIGO_EMAIL_${upper}`];
  const password = process.env[`SPORTIGO_PASSWORD_${upper}`];
  if (!email || !password) {
    throw new SportigoNotConfiguredError(user);
  }
  return { email, password };
}

export async function loginSportigo(user: SportigoUser): Promise<{ appToken: string; memberId?: string }> {
  const { email, password } = readCredentials(user);
  const resp = await fetch(LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new SportigoAuthError(`Login Sportigo échoué (${resp.status}) ${text.slice(0, 200)}`, resp.status);
  }
  const json = (await resp.json()) as Record<string, unknown>;
  const member = (json.member ?? json.data ?? json) as Record<string, unknown>;
  const appToken = (member?.appToken ?? json.appToken) as string | undefined;
  if (!appToken) {
    throw new SportigoAuthError("Réponse de login Sportigo sans appToken");
  }
  const rawId = (member?.id ?? member?._id ?? member?.memberId) as
    | string
    | number
    | undefined;
  const memberId = rawId != null ? String(rawId) : undefined;
  return { appToken, memberId };
}

// Appel générique au proxy Sportigo.
async function callService<T>(
  appToken: string,
  url: string,
  method: "get" | "post" | "delete" | "put",
  data: Record<string, unknown> = {},
): Promise<T> {
  const resp = await fetch(SERVICE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, method, data, appToken }),
  });
  const raw = await resp.text();
  let payload: unknown = undefined;
  try {
    payload = raw ? JSON.parse(raw) : undefined;
  } catch {
    payload = raw;
  }
  if (!resp.ok) {
    throw new SportigoApiError(
      `Sportigo ${method.toUpperCase()} ${url} → ${resp.status}`,
      resp.status,
      payload,
    );
  }
  // Certaines réponses Sportigo encapsulent les erreurs dans le body avec status 200.
  if (payload && typeof payload === "object" && "error" in (payload as Record<string, unknown>)) {
    const err = (payload as Record<string, unknown>).error;
    if (err) {
      throw new SportigoApiError(
        typeof err === "string" ? err : "Erreur Sportigo",
        resp.status,
        payload,
      );
    }
  }
  return payload as T;
}

export type RawPlanningEvent = {
  _id?: string;
  id?: string;
  roomId?: number;
  room?: { _id?: string; id?: string | number };
  discipline?: string | { name?: string };
  name?: string;
  dateStart?: string;
  dateEnd?: string;
  start?: string;
  end?: string;
  startAt?: string;
  endAt?: string;
  capacity?: number;
  maxBookings?: number;
  bookings?: number;
  countBookings?: number;
  reservationsCount?: number;
  bookedCount?: number;
  isFull?: boolean;
  [k: string]: unknown;
};

export async function fetchPlanning(
  appToken: string,
  dateStart: string,
  dateEnd: string,
): Promise<RawPlanningEvent[]> {
  // L'API attend des dates au format Sportigo. On laisse passer la string telle quelle
  // (YYYY-MM-DD ou ISO complet) — Sportigo accepte les deux.
  const payload = await callService<unknown>(appToken, "/planningdx", "post", {
    dateStart,
    dateEnd,
  });
  // La forme réelle est typiquement { events: [...] } ou directement un array.
  if (Array.isArray(payload)) return payload as RawPlanningEvent[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.events)) return obj.events as RawPlanningEvent[];
    if (Array.isArray(obj.data)) return obj.data as RawPlanningEvent[];
    if (Array.isArray(obj.planning)) return obj.planning as RawPlanningEvent[];
  }
  return [];
}

export type BookEventInput = {
  roomId: number;
  dateLesson: string;
  eventID: string;
  memberId?: string;
  // roomType : "cours-co" pour Accès libre, "coaching" pour The Reset.
  // Sert à router vers le bon endpoint de booking côté Sportigo.
  activity?: string;
  // disciplineId requis pour booker un slot "coaching" (via /appointment/reserve).
  disciplineId?: number;
};

export type BookEventResult = {
  reservationId: string;
};

// 2 endpoints distincts côté Sportigo selon le type de salle :
//   - cours-co (Accès libre)  : POST /reservation        { eventId, date, members, activity, nbFriends }
//   - coaching (The Reset)    : POST /appointment/reserve { eventId, date, disciplineId, nbPlace }
// Dans les deux cas la réponse de succès est { status:"success", member:{...,reservations:[...]} }
// dont on extrait reservationId par match sur startDate.
export async function bookEvent(
  appToken: string,
  input: BookEventInput,
): Promise<BookEventResult> {
  if (!input.memberId) {
    throw new SportigoApiError("memberId manquant — le login ne l'a pas fourni");
  }
  const date = input.dateLesson.includes("T")
    ? input.dateLesson.replace("T", " ").slice(0, 19)
    : input.dateLesson;
  const activity =
    input.activity ?? (input.roomId === 3539 ? "coaching" : "cours-co");
  const isCoaching = activity === "coaching" || input.roomId === 3539;

  let payload: unknown;
  if (isCoaching) {
    if (!input.disciplineId) {
      throw new SportigoApiError(
        "disciplineId manquant pour booker un créneau coaching",
      );
    }
    const eventIdNum = Number(String(input.eventID).split("_")[0]);
    const body = {
      eventId: eventIdNum,
      date,
      disciplineId: input.disciplineId,
      nbPlace: 1,
    };
    payload = await callService<unknown>(
      appToken,
      "/appointment/reserve",
      "post",
      body,
    );
  } else {
    const body = {
      eventId: input.eventID,
      date,
      members: [Number(input.memberId)],
      activity,
      nbFriends: 0,
    };
    payload = await callService<unknown>(appToken, "/reservation", "post", body);
  }

  // Extraction : on cherche dans member.reservations[] la résa correspondante
  // (match sur startDate + room).
  const obj = payload as Record<string, unknown> | null;
  const member = obj?.member as Record<string, unknown> | undefined;
  const reservations =
    (member?.reservations as Array<Record<string, unknown>> | undefined) ?? [];
  const found = reservations
    .filter(
      (r) =>
        (r.startDate as string | undefined) === date &&
        Number(r.room) === input.roomId,
    )
    .sort(
      (a, b) =>
        Number(b.reservationId ?? 0) - Number(a.reservationId ?? 0),
    )[0];
  const reservationId = found?.reservationId;
  if (!reservationId) {
    throw new SportigoApiError(
      "Réservation créée mais reservationId introuvable dans la réponse",
      undefined,
      payload,
    );
  }
  return { reservationId: String(reservationId) };
}

export async function cancelReservation(
  appToken: string,
  reservationId: string,
): Promise<void> {
  await callService<unknown>(appToken, `/reservation/${reservationId}`, "delete");
}
