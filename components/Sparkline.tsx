// Mini-courbe sur quelques jours, sous une métrique.
// Trait gris discret, point du jour en couleur d'accent, référence (médiane)
// en pointillé. Survol : infobulle native avec la date et la valeur.

type Point = { date: string; value: number | null };

type Props = {
  points: Point[]; // ordre chronologique, le dernier = aujourd'hui
  reference?: number | null; // ex. médiane 60j, tracée en pointillé
  unit: string; // pour les infobulles : "ms", "bpm"
  label: string; // pour les lecteurs d'écran
  width?: number;
  height?: number;
};

const PAD = 5; // marge pour que le point du jour et son anneau ne soient pas coupés

function shortDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" }).format(d);
}

export function Sparkline({ points, reference = null, unit, label, width = 88, height = 26 }: Props) {
  const known = points.filter((p): p is { date: string; value: number } => p.value != null);
  if (known.length < 2) return null;

  const values = known.map((p) => p.value);
  if (reference != null) values.push(reference);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 1e-6) {
    min -= 1;
    max += 1;
  }

  const n = points.length;
  const x = (i: number) => PAD + (i * (width - 2 * PAD)) / Math.max(1, n - 1);
  const y = (v: number) => PAD + ((max - v) * (height - 2 * PAD)) / (max - min);

  // Tracé en segments : une valeur manquante coupe la ligne au lieu de mentir
  const segments: string[] = [];
  let current = "";
  points.forEach((p, i) => {
    if (p.value == null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    current += `${current ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
  });
  if (current) segments.push(current);

  const lastIndex = points.length - 1;
  const last = points[lastIndex];
  const first = known[0];
  const lastKnown = known[known.length - 1];
  const summary = `${label} sur ${n} jours : de ${Math.round(first.value)} à ${Math.round(lastKnown.value)} ${unit}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block mt-1 max-w-full overflow-visible"
      role="img"
      aria-label={summary}
    >
      {reference != null && (
        <line
          x1={PAD}
          x2={width - PAD}
          y1={y(reference)}
          y2={y(reference)}
          stroke="var(--color-body)"
          strokeOpacity={0.35}
          strokeWidth={1}
          strokeDasharray="2 3"
        >
          <title>{`Référence : ${Math.round(reference)} ${unit}`}</title>
        </line>
      )}
      {segments.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="var(--color-body)"
          strokeOpacity={0.55}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {last.value != null && (
        <circle
          cx={x(lastIndex)}
          cy={y(last.value)}
          r={3.5}
          fill="var(--color-brand-purple)"
          className="stroke-white dark:stroke-[#0d1520]"
          strokeWidth={2}
        />
      )}
      {/* Zones de survol, plus larges que les points */}
      {points.map((p, i) =>
        p.value == null ? null : (
          <circle key={p.date} cx={x(i)} cy={y(p.value)} r={7} fill="transparent">
            <title>{`${shortDay(p.date)} : ${Math.round(p.value)} ${unit}`}</title>
          </circle>
        ),
      )}
    </svg>
  );
}
