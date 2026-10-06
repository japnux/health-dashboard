-- Fuseau du téléphone (décalage UTC en minutes) à la première réception de la
-- nuit de ce jour : chaque nuit est lue à l'heure où elle a été dormie, même
-- après un changement de fuseau.
alter table public.daily_metrics
  add column if not exists tz_offset_min integer;

-- Idem par séance : son heure reste celle du lieu où elle a été faite.
alter table public.workouts
  add column if not exists tz_offset_min integer;
