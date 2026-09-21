// Anneau de progression façon app Forme, pour un score sur 10.
// L'arc porte la couleur d'état, la piste vide est la même teinte en clair.
// Le chiffre reste en couleur de texte : l'état est porté par l'anneau et
// par le libellé affiché à côté, jamais par la couleur seule.

type Props = {
  score: number | null; // 0-10
  color: string; // couleur CSS de l'arc
  label: string; // pour les lecteurs d'écran, ex. "Récupération"
  size?: number;
  stroke?: number;
  // Variante hors score /10 (ex. sommeil) : remplissage 0-1 et texte central libre
  progress?: number;
  center?: string;
};

export function ScoreRing({ score, color, label, size = 84, stroke = 8, progress, center }: Props) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = progress != null ? Math.max(0, Math.min(1, progress)) : score != null ? Math.max(0, Math.min(1, score / 10)) : 0;
  const whole = score != null ? Math.floor(score) : null;
  const decimal = score != null ? Math.round((score % 1) * 10) : 0;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={center != null ? `${label} ${center}` : score != null ? `${label} ${score} sur 10` : `${label} indisponible`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        {/* Piste : même teinte, en clair */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeOpacity={0.18}
          strokeWidth={stroke}
        />
        {pct > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${pct * circumference} ${circumference}`}
          />
        )}
      </svg>
      {center != null ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-base leading-none font-light text-[var(--color-heading)] dark:text-white">{center}</span>
        </div>
      ) : (
      <div className="absolute inset-0 flex items-baseline justify-center pt-[30%]">
        {whole != null ? (
          <>
            <span className="text-[1.6rem] leading-none font-light text-[var(--color-heading)] dark:text-white">
              {whole}
            </span>
            {decimal !== 0 && (
              <span className="text-sm leading-none font-light text-[var(--color-heading)] dark:text-white">
                .{decimal}
              </span>
            )}
          </>
        ) : (
          <span className="text-xl font-light text-[var(--color-body)]">—</span>
        )}
      </div>
      )}
    </div>
  );
}
