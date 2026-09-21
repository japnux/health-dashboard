"use client";

// Carte du tracé GPS d'une séance, coloré par vitesse (rampe bleue, clair =
// lent, foncé = rapide). Leaflet est chargé côté navigateur uniquement.

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { HR_ZONES } from "@/lib/hr-zones";

type RoutePoint = [number, number, number | null];

// Paliers de vitesse en km/h, du plus lent au plus rapide
const SPEED_BINS = [
  { max: 4, label: "< 4" },
  { max: 8, label: "4-8" },
  { max: 12, label: "8-12" },
  { max: 16, label: "12-16" },
  { max: Infinity, label: "≥ 16" },
];
// Même rampe ordinale que les zones cardio
const SPEED_COLORS = HR_ZONES.map((z) => z.color);

function speedColor(ms: number | null): string {
  if (ms == null) return "#94a3b8";
  const kmh = ms * 3.6;
  const i = SPEED_BINS.findIndex((b) => kmh < b.max);
  return SPEED_COLORS[i === -1 ? SPEED_COLORS.length - 1 : i];
}

export function RouteMap({ route }: { route: RoutePoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ref.current || route.length < 2) return;
    let map: import("leaflet").Map | null = null;
    let cancelled = false;

    import("leaflet")
      .then((L) => {
        if (cancelled || !ref.current) return;
        // scrollWheelZoom désactivé : la molette fait défiler la page, pas la carte
        map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: true });
        // Tuiles OpenStreetMap (sans clé), passées en gris pour que le tracé bleu
        // reste lisible, y compris sur la mer
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          className: "route-map-tiles",
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        const latlngs = route.map(([lat, lon]) => L.latLng(lat, lon));
        // Liseré blanc sous le tracé pour le détacher du fond de carte
        L.polyline(latlngs, { color: "#ffffff", weight: 6, opacity: 0.9 }).addTo(map);
        // Un segment par paire de points, coloré selon la vitesse
        for (let i = 1; i < route.length; i++) {
          L.polyline([latlngs[i - 1], latlngs[i]], { color: speedColor(route[i][2]), weight: 3, opacity: 1 }).addTo(map);
        }
        L.circleMarker(latlngs[0], { radius: 6, color: "#ffffff", weight: 2, fillColor: "#15be53", fillOpacity: 1 })
          .bindTooltip("Départ")
          .addTo(map);
        L.circleMarker(latlngs[latlngs.length - 1], { radius: 6, color: "#ffffff", weight: 2, fillColor: "#18181b", fillOpacity: 1 })
          .bindTooltip("Arrivée")
          .addTo(map);

        map.fitBounds(L.latLngBounds(latlngs), { padding: [24, 24] });
      })
      .catch(() => setError(true));

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [route]);

  if (error) return <p className="text-sm text-[var(--color-body)]">Impossible d&apos;afficher la carte.</p>;

  return (
    <div>
      <style>{`.route-map-tiles { filter: grayscale(1) contrast(0.9) brightness(1.05); }`}</style>
      <div ref={ref} className="h-72 sm:h-80 w-full rounded-[var(--radius-md)] overflow-hidden z-0" role="img" aria-label="Tracé GPS de la séance" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11px] text-[var(--color-body)]">
        <span>Vitesse (km/h)</span>
        {SPEED_BINS.map((b, i) => (
          <span key={b.label} className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-1.5 rounded-full" style={{ backgroundColor: SPEED_COLORS[i] }} />
            {b.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-[#15be53]" /> départ
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-[#18181b]" /> arrivée
        </span>
      </div>
    </div>
  );
}
