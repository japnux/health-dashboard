-- Charge cardio : base du Strain calculé à partir de la fréquence cardiaque.

-- Par séance : FC moyenne/max, charge (Edwards pondérée) et minutes par zone
alter table public.workouts
  add column if not exists avg_hr_bpm integer,
  add column if not exists max_hr_bpm integer,
  add column if not exists cardio_load numeric,
  add column if not exists hr_zone_min jsonb;

-- Par jour : FC horaire (pour la charge hors séance) et charge totale du jour
alter table public.daily_metrics
  add column if not exists hr_hourly jsonb,
  add column if not exists cardio_load numeric;
