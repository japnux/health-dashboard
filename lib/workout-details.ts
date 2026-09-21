// Détails d'une séance extraits du payload Health Auto Export : courbe de FC
// minute par minute, FC après l'effort, tracé GPS allégé, distance et vitesses.
// Utilisé par l'endpoint auto-export et par le rattrapage des anciennes séances.

// [minutes depuis le début, FC moyenne, FC max de la minute]
export type HrPoint = [number, number, number];
// [secondes après la fin, FC]
export type RecoveryPoint = [number, number];
// [latitude, longitude, vitesse en m/s ou null]
export type RoutePoint = [number, number, number | null];

export type WorkoutDetails = {
  hr_series?: HrPoint[];
  hr_recovery?: RecoveryPoint[];
  route?: RoutePoint[];
  distance_km?: number;
  avg_speed_kmh?: number;
  max_speed_kmh?: number;
};

// Nombre maximal de points GPS gardés : largement assez pour tracer une carte,
// ~30 Ko au lieu de ~1 Mo pour une heure de séance
const ROUTE_MAX_POINTS = 600;
// Points GPS moins précis que ça (en mètres) : ignorés
const ROUTE_MAX_ACCURACY_M = 20;

/** "2026-09-21 18:34:00 +0200" → ISO UTC (null si illisible). */
export function parseHaeDate(dateStr: unknown): string | null {
  if (typeof dateStr !== "string" || !dateStr) return null;
  const normalized = dateStr
    .trim()
    .replace(" ", "T")
    .replace(/ ?([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function ms(dateStr: unknown): number | null {
  const iso = parseHaeDate(dateStr);
  return iso ? new Date(iso).getTime() : null;
}

const round = (v: number, decimals: number) => Math.round(v * 10 ** decimals) / 10 ** decimals;

/** Distance en mètres entre deux points GPS (formule de haversine). */
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Vitesse Health Auto Export ({ qty, units }) → km/h. */
function speedKmh(obj: unknown): number | null {
  const o = obj as { qty?: unknown; units?: unknown } | undefined;
  const q = Number(o?.qty);
  if (o?.qty == null || isNaN(q) || q < 0) return null;
  const units = String(o.units ?? "").toLowerCase();
  // HAE indique "km" (km/h) ou "mi" (mph) ; m/s par sécurité
  if (units.startsWith("mi")) return q * 1.609344;
  if (units === "m/s") return q * 3.6;
  return q;
}

export function extractWorkoutDetails(wo: Record<string, unknown>): WorkoutDetails {
  const out: WorkoutDetails = {};
  const startMs = ms(wo.start);
  const endMs = ms(wo.end);

  // ── Courbe de FC minute par minute ──
  if (startMs != null && Array.isArray(wo.heartRateData)) {
    const series: HrPoint[] = [];
    for (const p of wo.heartRateData as Record<string, unknown>[]) {
      const t = ms(p.date);
      const avg = Number(p.Avg ?? p.avg ?? p.qty);
      const max = Number(p.Max ?? p.max ?? avg);
      if (t == null || isNaN(avg) || avg <= 0) continue;
      series.push([round((t - startMs) / 60_000, 1), Math.round(avg), Math.round(isNaN(max) ? avg : max)]);
    }
    if (series.length >= 2) out.hr_series = series.sort((a, b) => a[0] - b[0]);
  }

  // ── FC après l'effort (récupération cardio) ──
  if (endMs != null && Array.isArray(wo.heartRateRecovery)) {
    const rec: RecoveryPoint[] = [];
    for (const p of wo.heartRateRecovery as Record<string, unknown>[]) {
      const t = ms(p.date);
      const v = Number(p.Avg ?? p.avg ?? p.qty);
      if (t == null || isNaN(v) || v <= 0) continue;
      rec.push([Math.round((t - endMs) / 1000), Math.round(v)]);
    }
    if (rec.length >= 2) out.hr_recovery = rec.sort((a, b) => a[0] - b[0]);
  }

  // ── Tracé GPS : points précis seulement, distance sur le tracé complet ──
  if (Array.isArray(wo.route)) {
    const pts = (wo.route as Record<string, unknown>[])
      .map((p) => ({
        lat: Number(p.latitude),
        lon: Number(p.longitude),
        speed: p.speed != null && Number(p.speed) >= 0 ? Number(p.speed) : null,
        acc: p.horizontalAccuracy != null ? Number(p.horizontalAccuracy) : 0,
      }))
      .filter((p) => !isNaN(p.lat) && !isNaN(p.lon) && p.acc <= ROUTE_MAX_ACCURACY_M);

    if (pts.length >= 2) {
      let dist = 0;
      for (let i = 1; i < pts.length; i++) dist += haversineM(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
      out.distance_km = round(dist / 1000, 2);

      // Allègement : un point sur N, en gardant le max de vitesse de chaque paquet
      // (sinon les pointes de vitesse, une vague par exemple, disparaissent)
      const step = Math.max(1, Math.ceil(pts.length / ROUTE_MAX_POINTS));
      const route: RoutePoint[] = [];
      for (let i = 0; i < pts.length; i += step) {
        const chunk = pts.slice(i, i + step);
        const speeds = chunk.map((p) => p.speed).filter((s): s is number => s != null);
        route.push([round(chunk[0].lat, 6), round(chunk[0].lon, 6), speeds.length > 0 ? round(Math.max(...speeds), 2) : null]);
      }
      const last = pts[pts.length - 1];
      route.push([round(last.lat, 6), round(last.lon, 6), last.speed != null ? round(last.speed, 2) : null]);
      out.route = route;
    }
  }

  const avgSpeed = speedKmh(wo.avgSpeed);
  const maxSpeed = speedKmh(wo.maxSpeed);
  if (avgSpeed != null) out.avg_speed_kmh = round(avgSpeed, 1);
  if (maxSpeed != null) out.max_speed_kmh = round(maxSpeed, 1);

  return out;
}

/**
 * Copie du payload pour sync_logs, sans les tracés GPS bruts (plusieurs Mo par
 * envoi) : on garde juste leur nombre de points. Le tracé allégé est dans workouts.
 */
export function stripRoutesForLog(payload: unknown): unknown {
  const root = payload as { data?: { workouts?: unknown[] }; workouts?: unknown[] } | null;
  const container = root?.data ?? root;
  if (!container || !Array.isArray(container.workouts)) return payload;
  const workouts = container.workouts.map((w) => {
    const wo = w as Record<string, unknown>;
    if (!Array.isArray(wo.route)) return wo;
    return { ...wo, route: { points: wo.route.length, stripped: true } };
  });
  return root?.data ? { ...root, data: { ...root.data, workouts } } : { ...root, workouts };
}

/** Récupération cardio : baisse de FC 1 et 2 minutes après la fin de la séance. */
export function heartRateRecoveryDrop(rec: RecoveryPoint[] | null | undefined): {
  endHr: number;
  drop1: number | null;
  drop2: number | null;
} | null {
  if (!rec || rec.length < 2) return null;
  const endHr = rec[0][1];
  // Point le plus proche de la cible, à 15 s près
  const at = (sec: number) => {
    let best: RecoveryPoint | null = null;
    for (const p of rec) if (Math.abs(p[0] - sec) <= 15 && (!best || Math.abs(p[0] - sec) < Math.abs(best[0] - sec))) best = p;
    return best ? endHr - best[1] : null;
  };
  return { endHr, drop1: at(60), drop2: at(120) };
}
