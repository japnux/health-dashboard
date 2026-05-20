#!/usr/bin/env python3
"""
Import Apple Health export.xml dans Supabase.

Parse le fichier XML en streaming (SAX) pour gérer les fichiers > 2 Go.
Agrège les données par jour (Europe/Paris) et insère dans :
  - daily_metrics (HRV, FC repos, sommeil, pas, kcal actives + recovery score)
  - workouts (type, durée, kcal)
  - body_composition (poids, body fat, lean mass)

Dédoublonnage : les pas, calories actives et lumière du jour sont dédoublonnés
par intervalles temporels pour éviter le double comptage iPhone + Apple Watch.
HRV : seules les lectures nocturnes (00h-08h) sont utilisées.
"""

import xml.sax
import os
import sys
import math
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from pathlib import Path
from zoneinfo import ZoneInfo
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / ".env.local"
load_dotenv(env_path)

from supabase import create_client

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

TZ = ZoneInfo("Europe/Paris")

# ── Types de records qui nous intéressent ─────────────────────────────────

RECORD_TYPES = {
    "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
    "HKQuantityTypeIdentifierRestingHeartRate",
    "HKCategoryTypeIdentifierSleepAnalysis",
    "HKQuantityTypeIdentifierStepCount",
    "HKQuantityTypeIdentifierActiveEnergyBurned",
    "HKQuantityTypeIdentifierBodyMass",
    "HKQuantityTypeIdentifierBodyFatPercentage",
    "HKQuantityTypeIdentifierLeanBodyMass",
    "HKQuantityTypeIdentifierTimeInDaylight",
}

SLEEP_ASLEEP = {
    "HKCategoryValueSleepAnalysisAsleepCore",
    "HKCategoryValueSleepAnalysisAsleepREM",
    "HKCategoryValueSleepAnalysisAsleepDeep",
    "HKCategoryValueSleepAnalysisAsleepUnspecified",
}

# ── Helpers ───────────────────────────────────────────────────────────────

def parse_apple_date(s):
    return datetime.strptime(s, "%Y-%m-%d %H:%M:%S %z")

def to_local_date(dt):
    return dt.astimezone(TZ).strftime("%Y-%m-%d")

def to_local_datetime(dt):
    return dt.astimezone(TZ).isoformat()

def sleep_night_date(start_dt):
    local = start_dt.astimezone(TZ)
    if local.hour < 14:
        return (local - timedelta(days=1)).strftime("%Y-%m-%d")
    return local.strftime("%Y-%m-%d")

def minutes_between(start, end):
    return (end - start).total_seconds() / 60


def deduplicate_intervals(intervals):
    """
    Dédoublonne des records avec intervalles temporels qui se chevauchent.
    intervals: list of (start_epoch, end_epoch, value)

    Tri par heure de début, puis intervalles plus courts d'abord (source plus précise).
    Pour les chevauchements, seule la portion non couverte est comptée.
    """
    if not intervals:
        return 0

    sorted_iv = sorted(intervals, key=lambda r: (r[0], r[1] - r[0]))

    claimed_end = -float('inf')
    total = 0.0

    for start, end, value in sorted_iv:
        if end <= start:
            continue
        if start >= claimed_end:
            total += value
            claimed_end = end
        elif end > claimed_end:
            duration = end - start
            unclaimed = end - claimed_end
            total += value * (unclaimed / duration)
            claimed_end = end

    return total


# ── Accumulateurs ─────────────────────────────────────────────────────────

daily = defaultdict(lambda: {
    "hrv_readings": [],       # (local_hour, value) — filtré nocturne ensuite
    "resting_hr_values": [],
    "sleep_total_min": 0,
    "sleep_rem_min": 0,
    "sleep_deep_min": 0,
    "sleep_core_min": 0,
    "step_intervals": [],     # (start_epoch, end_epoch, value)
    "kcal_intervals": [],     # (start_epoch, end_epoch, value)
    "daylight_intervals": [], # (start_epoch, end_epoch, value)
})

body_comp_records = []
workout_records = []

# ── SAX Handler ───────────────────────────────────────────────────────────

class HealthHandler(xml.sax.ContentHandler):
    def __init__(self):
        self.record_count = 0
        self.workout_count = 0
        self.current_workout = None

    def startElement(self, name, attrs):
        if name == "Record":
            self.handle_record(attrs)
        elif name == "Workout":
            self.handle_workout_start(attrs)
        elif name == "WorkoutStatistics":
            self.handle_workout_stats(attrs)

    def endElement(self, name):
        if name == "Workout":
            self.handle_workout_end()

    def handle_record(self, attrs):
        rec_type = attrs.get("type", "")
        if rec_type not in RECORD_TYPES:
            return

        self.record_count += 1
        if self.record_count % 100000 == 0:
            print(f"  {self.record_count:,} records traités…")

        start_str = attrs.get("startDate", "")
        end_str = attrs.get("endDate", "")
        value_str = attrs.get("value", "")

        try:
            start_dt = parse_apple_date(start_str)
            end_dt = parse_apple_date(end_str)
        except (ValueError, KeyError):
            return

        # ── HRV ──
        if rec_type == "HKQuantityTypeIdentifierHeartRateVariabilitySDNN":
            date = to_local_date(start_dt)
            local_hour = start_dt.astimezone(TZ).hour
            try:
                daily[date]["hrv_readings"].append((local_hour, float(value_str)))
            except ValueError:
                pass

        # ── FC repos ──
        elif rec_type == "HKQuantityTypeIdentifierRestingHeartRate":
            date = to_local_date(start_dt)
            try:
                daily[date]["resting_hr_values"].append(int(float(value_str)))
            except ValueError:
                pass

        # ── Sommeil (source unique Watch, pas de dédoublonnage nécessaire) ──
        elif rec_type == "HKCategoryTypeIdentifierSleepAnalysis":
            if value_str not in SLEEP_ASLEEP:
                return
            date = sleep_night_date(start_dt)
            dur = minutes_between(start_dt, end_dt)
            daily[date]["sleep_total_min"] += dur
            if value_str == "HKCategoryValueSleepAnalysisAsleepREM":
                daily[date]["sleep_rem_min"] += dur
            elif value_str == "HKCategoryValueSleepAnalysisAsleepDeep":
                daily[date]["sleep_deep_min"] += dur
            elif value_str == "HKCategoryValueSleepAnalysisAsleepCore":
                daily[date]["sleep_core_min"] += dur

        # ── Pas (dédoublonnage par intervalles) ──
        elif rec_type == "HKQuantityTypeIdentifierStepCount":
            date = to_local_date(start_dt)
            try:
                daily[date]["step_intervals"].append((
                    start_dt.timestamp(),
                    end_dt.timestamp(),
                    int(float(value_str)),
                ))
            except ValueError:
                pass

        # ── Kcal actives (dédoublonnage par intervalles) ──
        elif rec_type == "HKQuantityTypeIdentifierActiveEnergyBurned":
            date = to_local_date(start_dt)
            try:
                daily[date]["kcal_intervals"].append((
                    start_dt.timestamp(),
                    end_dt.timestamp(),
                    float(value_str),
                ))
            except ValueError:
                pass

        # ── Lumière du jour (dédoublonnage par intervalles) ──
        elif rec_type == "HKQuantityTypeIdentifierTimeInDaylight":
            date = to_local_date(start_dt)
            try:
                daily[date]["daylight_intervals"].append((
                    start_dt.timestamp(),
                    end_dt.timestamp(),
                    float(value_str),
                ))
            except ValueError:
                pass

        # ── Poids ──
        elif rec_type == "HKQuantityTypeIdentifierBodyMass":
            try:
                body_comp_records.append({
                    "datetime": to_local_datetime(start_dt),
                    "date": to_local_date(start_dt),
                    "weight_kg": round(float(value_str), 2),
                })
            except ValueError:
                pass

        # ── Body fat ──
        elif rec_type == "HKQuantityTypeIdentifierBodyFatPercentage":
            try:
                val = float(value_str)
                if val < 1:
                    val *= 100
                body_comp_records.append({
                    "datetime": to_local_datetime(start_dt),
                    "date": to_local_date(start_dt),
                    "body_fat_pct": round(val, 1),
                })
            except ValueError:
                pass

        # ── Lean mass ──
        elif rec_type == "HKQuantityTypeIdentifierLeanBodyMass":
            try:
                body_comp_records.append({
                    "datetime": to_local_datetime(start_dt),
                    "date": to_local_date(start_dt),
                    "lean_mass_kg": round(float(value_str), 2),
                })
            except ValueError:
                pass

    def handle_workout_start(self, attrs):
        activity_type = attrs.get("workoutActivityType", "")
        clean_type = activity_type.replace("HKWorkoutActivityType", "")

        start_str = attrs.get("startDate", "")
        duration_str = attrs.get("duration", "")

        try:
            start_dt = parse_apple_date(start_str)
        except (ValueError, KeyError):
            self.current_workout = None
            return

        try:
            duration_min = round(float(duration_str))
        except (ValueError, TypeError):
            duration_min = None

        self.current_workout = {
            "started_at": to_local_datetime(start_dt),
            "type": clean_type,
            "duration_min": duration_min,
            "kcal": None,
        }
        self.workout_count += 1

    def handle_workout_stats(self, attrs):
        if self.current_workout is None:
            return
        stat_type = attrs.get("type", "")
        if stat_type == "HKQuantityTypeIdentifierActiveEnergyBurned":
            try:
                self.current_workout["kcal"] = round(float(attrs.get("sum", "0")))
            except ValueError:
                pass

    def handle_workout_end(self):
        if self.current_workout:
            workout_records.append(self.current_workout)
        self.current_workout = None


# ── Recovery score (port simplifié du TS) ─────────────────────────────────

def interpolate(value, in_min, in_max, out_min, out_max):
    if value <= in_min:
        return out_min
    if value >= in_max:
        return out_max
    t = (value - in_min) / (in_max - in_min)
    return out_min + t * (out_max - out_min)

def score_hrv(hrv_ms, hrv_7d_avg):
    if hrv_ms is None or hrv_7d_avg is None or hrv_7d_avg <= 0:
        return None
    ratio = hrv_ms / hrv_7d_avg
    if ratio >= 1.1: return 10
    if ratio >= 1.0: return interpolate(ratio, 1.0, 1.1, 7, 10)
    if ratio >= 0.9: return interpolate(ratio, 0.9, 1.0, 4, 7)
    if ratio >= 0.8: return interpolate(ratio, 0.8, 0.9, 1, 4)
    return 1

def score_resting_hr(hr, hr_7d_avg):
    if hr is None or hr_7d_avg is None:
        return None
    delta = hr - hr_7d_avg
    if delta <= -3: return 10
    if delta <= 0: return interpolate(delta, -3, 0, 10, 7)
    if delta <= 3: return interpolate(delta, 0, 3, 7, 4)
    if delta <= 7: return interpolate(delta, 3, 7, 4, 1)
    return 1

def score_sleep(total_min, rem_pct, deep_pct):
    if total_min is None or total_min == 0:
        return None
    total_h = total_min / 60
    rp = rem_pct or 0
    dp = deep_pct or 0
    if total_h >= 7.5 and rp >= 20 and dp >= 15:
        return 10
    if total_h >= 7 and rp >= 15 and dp >= 10:
        return 7
    if total_h >= 6:
        return 4
    return 1

def compute_recovery(hrv_ms, hrv_7d, rhr, rhr_7d, sleep_min, rem_pct, deep_pct):
    s_hrv = score_hrv(hrv_ms, hrv_7d)
    s_hr = score_resting_hr(rhr, rhr_7d)
    s_sleep = score_sleep(sleep_min, rem_pct, deep_pct)

    components = [
        (s_hrv, 0.4),
        (s_hr, 0.3),
        (s_sleep, 0.3),
    ]
    available = [(s, w) for s, w in components if s is not None]
    if not available:
        return None, "estimated"

    total_w = sum(w for _, w in available)
    raw = sum(s * w for s, w in available) / total_w
    score = round(raw * 2) / 2

    n = len(available)
    basis = "full" if n == 3 else "partial" if n == 2 else "estimated"
    return score, basis


# ── Main ──────────────────────────────────────────────────────────────────

def main():
    xml_path = Path(__file__).resolve().parent.parent / "Apple data" / "apple_health_export" / "export.xml"
    if not xml_path.exists():
        print(f"Fichier introuvable : {xml_path}")
        sys.exit(1)

    print(f"Parsing {xml_path.name} ({xml_path.stat().st_size / 1e9:.1f} Go)…")

    handler = HealthHandler()
    parser = xml.sax.make_parser()
    parser.setFeature(xml.sax.handler.feature_external_ges, False)
    parser.setContentHandler(handler)
    parser.parse(str(xml_path))

    print(f"\nParsing terminé :")
    print(f"  {handler.record_count:,} records pertinents")
    print(f"  {len(daily):,} jours avec données")
    print(f"  {handler.workout_count:,} workouts")
    print(f"  {len(body_comp_records):,} mesures body composition")

    # ── Connexion Supabase ──
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # ── 1. daily_metrics ──
    print("\n── Import daily_metrics ──")
    sorted_dates = sorted(daily.keys())
    print(f"  Plage : {sorted_dates[0]} → {sorted_dates[-1]}")

    # Fenêtre glissante pour les moyennes 7j
    hrv_window = []
    hr_window = []

    # Stats de dédoublonnage
    dedup_stats = {"steps_raw": 0, "steps_dedup": 0, "kcal_raw": 0, "kcal_dedup": 0}

    batch = []
    for date in sorted_dates:
        d = daily[date]

        # HRV : lectures nocturnes (00h-08h) en priorité, sinon toutes
        readings = d["hrv_readings"]
        overnight = [v for h, v in readings if h < 8]
        if overnight:
            hrv_ms = round(sum(overnight) / len(overnight), 1)
        elif readings:
            hrv_ms = round(sum(v for _, v in readings) / len(readings), 1)
        else:
            hrv_ms = None

        resting_hr = d["resting_hr_values"][-1] if d["resting_hr_values"] else None

        sleep_total = round(d["sleep_total_min"]) if d["sleep_total_min"] > 0 else None
        sleep_rem_pct = None
        sleep_deep_pct = None
        if sleep_total and sleep_total > 0:
            total_asleep = d["sleep_total_min"]
            sleep_rem_pct = round(d["sleep_rem_min"] / total_asleep * 100, 1) if total_asleep > 0 else None
            sleep_deep_pct = round(d["sleep_deep_min"] / total_asleep * 100, 1) if total_asleep > 0 else None

        # Pas et kcal : dédoublonnage par intervalles
        raw_steps = sum(v for _, _, v in d["step_intervals"])
        steps_dedup = round(deduplicate_intervals(d["step_intervals"])) if d["step_intervals"] else None
        dedup_stats["steps_raw"] += raw_steps
        dedup_stats["steps_dedup"] += steps_dedup or 0

        raw_kcal = sum(v for _, _, v in d["kcal_intervals"])
        kcal_dedup = round(deduplicate_intervals(d["kcal_intervals"])) if d["kcal_intervals"] else None
        dedup_stats["kcal_raw"] += raw_kcal
        dedup_stats["kcal_dedup"] += kcal_dedup or 0

        # Lumière du jour : dédoublonnage par intervalles
        daylight_min = round(deduplicate_intervals(d["daylight_intervals"])) if d["daylight_intervals"] else None

        # Moyenne 7j glissante
        hrv_7d = None
        if hrv_ms is not None:
            hrv_window.append((date, hrv_ms))
        hrv_window = [(dt, v) for dt, v in hrv_window if dt > (datetime.strptime(date, "%Y-%m-%d") - timedelta(days=7)).strftime("%Y-%m-%d") and dt < date]
        if hrv_window:
            hrv_7d = sum(v for _, v in hrv_window) / len(hrv_window)

        hr_7d = None
        if resting_hr is not None:
            hr_window.append((date, resting_hr))
        hr_window = [(dt, v) for dt, v in hr_window if dt > (datetime.strptime(date, "%Y-%m-%d") - timedelta(days=7)).strftime("%Y-%m-%d") and dt < date]
        if hr_window:
            hr_7d = sum(v for _, v in hr_window) / len(hr_window)

        recovery_score, recovery_basis = compute_recovery(
            hrv_ms, hrv_7d, resting_hr, hr_7d,
            sleep_total, sleep_rem_pct, sleep_deep_pct
        )

        if hrv_ms is not None:
            hrv_window.append((date, hrv_ms))
        if resting_hr is not None:
            hr_window.append((date, resting_hr))

        row = {
            "date": date,
            "hrv_ms": hrv_ms,
            "resting_hr_bpm": resting_hr,
            "sleep_total_min": sleep_total,
            "sleep_rem_pct": sleep_rem_pct,
            "sleep_deep_pct": sleep_deep_pct,
            "steps": steps_dedup,
            "active_kcal": kcal_dedup,
            "daylight_min": daylight_min,
            "recovery_score": recovery_score,
            "recovery_score_basis": recovery_basis,
        }
        batch.append(row)

        if len(batch) >= 500:
            supabase.table("daily_metrics").upsert(batch, on_conflict="date").execute()
            print(f"  Upsert {len(batch)} jours (jusqu'à {date})")
            batch = []

    if batch:
        supabase.table("daily_metrics").upsert(batch, on_conflict="date").execute()
        print(f"  Upsert {len(batch)} jours (final)")

    print(f"  Total : {len(sorted_dates)} jours insérés")

    # Stats de dédoublonnage
    if dedup_stats["steps_raw"] > 0:
        pct_steps = round((1 - dedup_stats["steps_dedup"] / dedup_stats["steps_raw"]) * 100, 1)
        pct_kcal = round((1 - dedup_stats["kcal_dedup"] / dedup_stats["kcal_raw"]) * 100, 1) if dedup_stats["kcal_raw"] > 0 else 0
        print(f"  Dédoublonnage pas : -{pct_steps}% (brut {dedup_stats['steps_raw']:,} → dédoublonné {dedup_stats['steps_dedup']:,})")
        print(f"  Dédoublonnage kcal : -{pct_kcal}% (brut {dedup_stats['kcal_raw']:,} → dédoublonné {dedup_stats['kcal_dedup']:,})")

    # ── 2. workouts ──
    print("\n── Import workouts ──")
    w_batch = []
    for w in workout_records:
        w_batch.append(w)
        if len(w_batch) >= 500:
            supabase.table("workouts").upsert(
                w_batch, on_conflict="started_at,type"
            ).execute()
            print(f"  Upsert {len(w_batch)} workouts")
            w_batch = []
    if w_batch:
        supabase.table("workouts").upsert(w_batch, on_conflict="started_at,type").execute()
        print(f"  Upsert {len(w_batch)} workouts (final)")
    print(f"  Total : {len(workout_records)} workouts insérés")

    # ── 3. body_composition ──
    print("\n── Import body_composition ──")
    bc_by_date = defaultdict(lambda: {"weight_kg": None, "body_fat_pct": None, "lean_mass_kg": None, "datetime": None})
    for rec in body_comp_records:
        d = rec["date"]
        if rec.get("weight_kg") is not None:
            bc_by_date[d]["weight_kg"] = rec["weight_kg"]
            bc_by_date[d]["datetime"] = rec["datetime"]
        if rec.get("body_fat_pct") is not None:
            bc_by_date[d]["body_fat_pct"] = rec["body_fat_pct"]
            if bc_by_date[d]["datetime"] is None:
                bc_by_date[d]["datetime"] = rec["datetime"]
        if rec.get("lean_mass_kg") is not None:
            bc_by_date[d]["lean_mass_kg"] = rec["lean_mass_kg"]
            if bc_by_date[d]["datetime"] is None:
                bc_by_date[d]["datetime"] = rec["datetime"]

    bc_batch = []
    for date in sorted(bc_by_date.keys()):
        rec = bc_by_date[date]
        if rec["weight_kg"] is None and rec["body_fat_pct"] is None and rec["lean_mass_kg"] is None:
            continue
        bc_batch.append({
            "measured_at": date,
            "weight_kg": rec["weight_kg"],
            "body_fat_pct": rec["body_fat_pct"],
            "lean_mass_kg": rec["lean_mass_kg"],
        })

    if bc_batch:
        supabase.table("body_composition").upsert(
            bc_batch, on_conflict="measured_at"
        ).execute()
    print(f"  Total : {len(bc_batch)} mesures insérées")

    print("\nImport terminé.")


if __name__ == "__main__":
    main()
