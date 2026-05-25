-- Réservations Sportigo (compte Geoffrey + compte Lauriane)
-- On stocke uniquement les IDs des réservations + un peu de contexte pour pouvoir
-- les retrouver et les annuler. Les détails à jour (places restantes, etc.)
-- sont relus en temps réel depuis l'API Sportigo à chaque load.

create table if not exists public.sportigo_reservations (
  id uuid primary key default gen_random_uuid(),
  user_key text not null check (user_key in ('geoffrey','lauriane')),
  reservation_id text not null,
  event_id text not null,
  room_id integer not null,
  discipline text not null,
  date date not null,
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_key, reservation_id)
);

create index if not exists sportigo_reservations_user_date_idx
  on public.sportigo_reservations (user_key, date);

-- RLS désactivée (cohérent avec le reste du MVP single-user).
