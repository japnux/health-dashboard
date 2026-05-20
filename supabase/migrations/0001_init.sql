-- Migration initiale Health Dashboard MVP
-- À exécuter dans Supabase SQL Editor

-- Métriques journalières (1 ligne / jour)
create table if not exists daily_metrics (
  date date primary key,
  hrv_ms numeric,
  resting_hr_bpm integer,
  sleep_total_min integer,
  sleep_rem_pct numeric,
  sleep_deep_pct numeric,
  steps integer,
  active_kcal integer,
  recovery_score numeric,
  recovery_score_basis text check (recovery_score_basis in ('full', 'partial', 'estimated', null)),
  raw_payload jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Composition corporelle (1 ligne / mesure)
create table if not exists body_composition (
  measured_at date primary key,
  weight_kg numeric not null,
  body_fat_pct numeric,
  lean_mass_kg numeric,
  protein_target_g integer,
  created_at timestamptz default now()
);

-- Séances Apple Health
create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  type text,
  duration_min integer,
  kcal integer,
  source text default 'apple_health',
  created_at timestamptz default now(),
  unique (started_at, type)
);

create index if not exists workouts_started_at_idx on workouts (started_at desc);

-- Logs protéines (plusieurs entrées / jour)
create table if not exists protein_logs (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  grams integer not null check (grams > 0),
  source text default 'manual',
  logged_at timestamptz default now()
);

create index if not exists protein_logs_date_idx on protein_logs (date);

-- Trigger pour updated_at sur daily_metrics
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists daily_metrics_updated_at on daily_metrics;
create trigger daily_metrics_updated_at
  before update on daily_metrics
  for each row execute function set_updated_at();

-- RLS désactivée pour le MVP single-user.
-- À activer avant tout déploiement public.
