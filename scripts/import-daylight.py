#!/usr/bin/env python3
"""Import TimeInDaylight depuis export.xml → daily_metrics.daylight_min"""

import xml.sax
import os
import sys
from datetime import datetime
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

daily_daylight = defaultdict(float)

def parse_apple_date(s):
    return datetime.strptime(s, "%Y-%m-%d %H:%M:%S %z")

def to_local_date(dt):
    return dt.astimezone(TZ).strftime("%Y-%m-%d")

class Handler(xml.sax.ContentHandler):
    def __init__(self):
        self.count = 0

    def startElement(self, name, attrs):
        if name != "Record":
            return
        if attrs.get("type") != "HKQuantityTypeIdentifierTimeInDaylight":
            return
        self.count += 1
        if self.count % 10000 == 0:
            print(f"  {self.count:,} records…")
        try:
            start_dt = parse_apple_date(attrs.get("startDate", ""))
            value = float(attrs.get("value", "0"))
            date = to_local_date(start_dt)
            daily_daylight[date] += value
        except (ValueError, KeyError):
            pass

def main():
    xml_path = Path(__file__).resolve().parent.parent / "Apple data" / "apple_health_export" / "export.xml"
    print(f"Parsing daylight data…")

    handler = Handler()
    parser = xml.sax.make_parser()
    parser.setFeature(xml.sax.handler.feature_external_ges, False)
    parser.setContentHandler(handler)
    parser.parse(str(xml_path))

    print(f"  {handler.count:,} records → {len(daily_daylight)} jours")

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    batch = []
    for date in sorted(daily_daylight.keys()):
        batch.append({
            "date": date,
            "daylight_min": round(daily_daylight[date]),
        })
        if len(batch) >= 500:
            supabase.table("daily_metrics").upsert(batch, on_conflict="date").execute()
            print(f"  Upsert {len(batch)} jours")
            batch = []
    if batch:
        supabase.table("daily_metrics").upsert(batch, on_conflict="date").execute()
        print(f"  Upsert {len(batch)} jours (final)")

    print("Done.")

if __name__ == "__main__":
    main()
