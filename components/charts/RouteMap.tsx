"use client";

// Carte du tracé GPS d'une séance, coloré par vitesse (rampe bleue, clair =
// lent, foncé = rapide). Leaflet est chargé côté navigateur uniquement.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  if (ms == null) return "#8e8e93";
  const kmh = ms * 3.6;
  const i = SPEED_BINS.findIndex((b) => kmh < b.max);
  return SPEED_COLORS[i === -1 ? SPEED_COLORS.length - 1 : i];
}

const DARK_QUERY = "(prefers-color-scheme: dark)";
function subscribeDark(onChange: () => void) {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const getDark = () => window.matchMedia(DARK_QUERY).matches;

// Fond de carte gris en clair ; en sombre, tuiles inversées pour un fond
// sombre cohérent avec la page (sans autre fournisseur de tuiles ni clé).
const MAP_CSS = `
/* Filtre sur tout le calque de tuiles, pas tuile par tuile : filtrées une à
   une, les tuiles ont un bord adouci qui dessine des lignes entre elles */
.route-map .leaflet-tile-pane { filter: grayscale(1) contrast(0.9) brightness(1.05); }
.route-map img.leaflet-tile { max-width: none !important; max-height: none !important; }
@media (prefers-color-scheme: dark) {
  .route-map .leaflet-tile-pane { filter: grayscale(1) invert(1) brightness(0.8) contrast(0.85); }
  .route-map.leaflet-container { background: #1c1c1e; }
  .route-map .leaflet-bar { border-color: rgb(255 255 255 / 0.15); }
  .route-map .leaflet-bar a { background: #2c2c2e; color: #f4f4f5; border-bottom-color: rgb(255 255 255 / 0.12); }
  .route-map .leaflet-bar a:hover { background: #3a3a3c; }
  .route-map .leaflet-control-attribution { background: rgb(28 28 30 / 0.75); color: #a1a1aa; }
  .route-map .leaflet-control-attribution a { color: #d4d4d8; }
}
`;

export function RouteMap({ route }: { route: RoutePoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  // Thème du système : la carte suit le clair / sombre, y compris en cas de bascule
  const dark = useSyncExternalStore(subscribeDark, getDark, () => false);

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
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        const latlngs = route.map(([lat, lon]) => L.latLng(lat, lon));
        // Liseré blanc sous le tracé pour le détacher du fond de carte
        // Liseré de la couleur du fond pour détacher le tracé
        const surface = dark ? "#1c1c1e" : "#ffffff";
        L.polyline(latlngs, { color: surface, weight: 6, opacity: 0.9 }).addTo(map);
        // Un segment par paire de points, coloré selon la vitesse
        for (let i = 1; i < route.length; i++) {
          L.polyline([latlngs[i - 1], latlngs[i]], { color: speedColor(route[i][2]), weight: 3, opacity: 1 }).addTo(map);
        }
        L.circleMarker(latlngs[0], { radius: 6, color: surface, weight: 2, fillColor: "#34c759", fillOpacity: 1 })
          .bindTooltip("Départ")
          .addTo(map);
        L.circleMarker(latlngs[latlngs.length - 1], {
          radius: 6,
          color: surface,
          weight: 2,
          fillColor: dark ? "#ffffff" : "#18181b",
          fillOpacity: 1,
        })
          .bindTooltip("Arrivée")
          .addTo(map);

        map.fitBounds(L.latLngBounds(latlngs), { padding: [24, 24] });
      })
      .catch(() => setError(true));

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [route, dark]);

  if (error) return <p className="text-sm text-[var(--color-body)]">Impossible d&apos;afficher la carte.</p>;

  return (
    <div>
      <style>{MAP_CSS}</style>
      <div ref={ref} className="route-map h-72 sm:h-80 w-full rounded-[var(--radius-md)] overflow-hidden z-0" role="img" aria-label="Tracé GPS de la séance" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11px] text-[var(--color-body)]">
        <span>Vitesse (km/h)</span>
        {SPEED_BINS.map((b, i) => (
          <span key={b.label} className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-1.5 rounded-full" style={{ backgroundColor: SPEED_COLORS[i] }} />
            {b.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-[#34c759]" /> départ
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-[#18181b] dark:bg-white" /> arrivée
        </span>
      </div>
    </div>
  );
}
