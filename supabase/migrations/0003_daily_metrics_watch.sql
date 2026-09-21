-- Nouvelles données Apple Watch dans daily_metrics.
-- Toutes optionnelles : une montre ou une automation Health Auto Export qui
-- ne les envoie pas laisse simplement la colonne à null.

alter table public.daily_metrics
  -- Régularité du sommeil (déjà présents dans sleep_analysis)
  add column if not exists sleep_start timestamptz,
  add column if not exists sleep_end timestamptz,
  -- Cardio journalier (déjà reçus)
  add column if not exists walking_hr_avg_bpm integer,
  add column if not exists hr_max_bpm integer,
  add column if not exists hr_min_bpm integer,
  -- Nuit (à activer dans Health Auto Export)
  add column if not exists wrist_temp_c numeric,
  add column if not exists breathing_disturbances numeric,
  -- Forme de fond (à activer dans Health Auto Export)
  add column if not exists vo2_max numeric,
  add column if not exists cardio_recovery_bpm numeric;
