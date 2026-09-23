"use client";

import { NUTRITION_ENABLED, SPORTIGO_ENABLED } from "@/lib/features";
import { createContext, useContext, useEffect, useState } from "react";
import { MusculationBookButton } from "./MusculationBookButton";
import { workoutEmoji } from "@/lib/workout-types";

// État "Détails" de la séance suggérée, partagé avec son contenu (activités
// prévues : les activités secondaires ne s'affichent qu'une fois déplié)
const SuggestionDetailsContext = createContext(false);
export function useSuggestionDetailsOpen() {
  return useContext(SuggestionDetailsContext);
}

type AiTrend = {
  title: string;
  emoji: string;
  category: "sommeil" | "récupération" | "activité" | "nutrition";
  bullets: string[];
  comparison: string | null;
  confidence: "haute" | "moyenne" | "basse";
  type: "info" | "warning" | "positive";
};

type AiRecommendation = {
  emoji: string;
  text: string;
  priority: "P1" | "P2" | "P3";
  category: "sommeil" | "récupération" | "activité" | "nutrition" | "général";
};

type AiWorkoutReco = {
  type: string;
  intensity: string;
  duration: string;
  reason: string;
  factors: string[];
};

type AiInsightsData = {
  trends: AiTrend[];
  recommendations: AiRecommendation[];
  workoutSuggestion: AiWorkoutReco;
  generatedAt: string;
  cached: boolean;
};

const TREND_STYLE: Record<string, string> = {
  positive: "border-[#34c759]/20 bg-[#34c759]/5",
  warning: "border-[#ffcc00]/20 bg-[#ffcc00]/5",
  info: "border-[var(--color-border)] bg-white dark:bg-white/5",
};

const TREND_TITLE_COLOR: Record<string, string> = {
  positive: "text-[#1f7a3a] dark:text-[#6ee7a0]",
  warning: "text-[#8a6d00] dark:text-[#ffd60a]",
  info: "text-[var(--color-heading)] dark:text-white",
};

const INTENSITY_COLOR: Record<string, string> = {
  repos: "text-[#1f7a3a] dark:text-[#6ee7a0] bg-[#34c759]/10 border-[#34c759]/20",
  "légère": "text-[#1f7a3a] dark:text-[#6ee7a0] bg-[#34c759]/10 border-[#34c759]/20",
  "modérée": "text-[#8a6d00] dark:text-[#ffd60a] bg-[#ffcc00]/10 border-[#ffcc00]/20",
  haute: "text-[#c0271e] dark:text-[#ff8a80] bg-[#ff3b30]/10 border-[#ff3b30]/20",
};

const INTENSITY_BG: Record<string, string> = {
  repos: "bg-[#34c759]/5 border-[#34c759]/15",
  "légère": "bg-[#34c759]/5 border-[#34c759]/15",
  "modérée": "bg-[#ffcc00]/5 border-[#ffcc00]/15",
  haute: "bg-[#ff3b30]/5 border-[#ff3b30]/15",
};

const WORKOUT_ICON: Record<string, string> = {
  repos: "🧘",
  "légère": "🚶",
  "modérée": "🏃",
  haute: "🔥",
};

// Normalise les noms Apple Health bruts en noms lisibles
const WORKOUT_TYPE_DISPLAY: Record<string, string> = {
  surfingsports: "Surf",
  "sports de surf": "Surf",
  functionalstrengthtraining: "Musculation",
  crosstraining: "Musculation",
  yoga: "Yoga",
  swimming: "Natation",
  "pool swim": "Natation",
  running: "Course",
  "outdoor run": "Course",
  "extérieur course": "Course",
  hiking: "Randonnée",
  walking: "Marche",
};

function displayWorkoutType(raw: string): string {
  return WORKOUT_TYPE_DISPLAY[raw.toLowerCase()] ?? raw;
}

// Emoji du sport suggéré (🏄 pour Surf...) ; pour un type sans sport connu
// (repos, mobilité), l'icône d'intensité
function suggestionIcon(type: string, intensity: string): string {
  const sport = workoutEmoji(type);
  return sport !== "🏅" ? sport : (WORKOUT_ICON[intensity] ?? "🏃");
}

// Requête en cours partagée par les composants qui montent en même temps
let inflight: Promise<AiInsightsData> | null = null;

function useAiInsightsData() {
  const [data, setData] = useState<AiInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (force: boolean) => {
    if (force) setRefreshing(true); else setLoading(true);
    // Chargement initial partagé entre les blocs de la page : une seule
    // requête, donc au plus une génération par l'IA
    const request =
      !force && inflight
        ? inflight
        : fetch(`/api/ai-insights${force ? "?refresh=1" : ""}`).then((r) => {
            if (!r.ok) throw new Error("Erreur chargement");
            return r.json() as Promise<AiInsightsData>;
          });
    if (!force) {
      inflight = request;
      request.finally(() => {
        if (inflight === request) inflight = null;
      }).catch(() => {});
    }
    request
      .then(setData)
      .catch(() => setError("Impossible de charger les analyses"))
      .finally(() => { setLoading(false); setRefreshing(false); });
  };

  useEffect(() => { load(false); }, []);

  const refresh = () => load(true);

  return { data, loading, refreshing, error, refresh };
}

export function AiInsights() {
  const { data, loading, error } = useAiInsightsData();

  if (error) return null;

  if (loading) {
    return (
      <>
        <SkeletonSection lines={3} />
        <SkeletonSection lines={4} />
      </>
    );
  }

  if (!data) return null;

  return (
    <>
      {data.trends.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--color-body)] font-normal mb-2">
            Tendances & signaux
          </p>
          <div className="space-y-2">
            {data.trends.map((trend, i) => (
              <TrendItem key={i} trend={trend} />
            ))}
          </div>
        </div>
      )}
      <WorkoutItem suggestion={data.workoutSuggestion} cached={data.cached} generatedAt={data.generatedAt} />
    </>
  );
}

export function AiTrends() {
  const { data, loading, refreshing, error, refresh } = useAiInsightsData();

  if (error || (!loading && !data)) return null;

  if (loading) return <SkeletonSection lines={3} />;

  if (!data || data.trends.length === 0) return null;

  const recos = data.recommendations ?? [];
  // Partie nutrition masquée : on n'affiche pas cette catégorie, même si
  // une ancienne réponse en cache en contient encore.
  const categories = (["récupération", "sommeil", "activité", "nutrition", "général"] as const).filter(
    (c) => NUTRITION_ENABLED || c !== "nutrition",
  );

  const grouped = categories
    .map((cat) => ({
      category: cat,
      trends: data.trends.filter((t) => t.category === cat),
      recos: recos.filter((r) => r.category === cat),
    }))
    .filter((g) => g.trends.length > 0 || g.recos.length > 0);

  return (
    <div>
      {/* Même hauteur d'en-tête que les titres de section (rangées alignées) */}
      <div className="flex items-center justify-between pt-2 mb-3">
        <h2 className="text-lg text-[var(--color-heading)] dark:text-white">Tendances</h2>
        <div className="flex items-center gap-2">
          {data.generatedAt && (
            <span className="text-[10px] text-[var(--color-body)]/50">
              {formatRelative(data.generatedAt)}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={refreshing}
            className="text-[10px] px-2 py-1 rounded-md bg-[var(--color-border)]/20 dark:bg-white/5 text-[var(--color-body)] hover:text-[var(--color-heading)] transition-colors disabled:opacity-50"
            title="Régénérer"
          >
            {refreshing ? (
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
                …
              </span>
            ) : "↻"}
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {grouped.map((group) => (
          <CategoryGroup key={group.category} group={group} />
        ))}
      </div>
    </div>
  );
}

const CATEGORY_EMOJI: Record<string, string> = {
  sommeil: "💤",
  "récupération": "💓",
  "activité": "🏃",
  nutrition: "🥩",
  "général": "📋",
};

function CategoryGroup({ group }: {
  group: {
    category: string;
    trends: AiTrend[];
    recos: AiRecommendation[];
  };
}) {
  const [open, setOpen] = useState(false);

  const firstTrend = group.trends[0];
  const title = firstTrend?.title ?? CATEGORY_LABEL[group.category] ?? group.category;
  const emoji = firstTrend?.emoji ?? CATEGORY_EMOJI[group.category] ?? "📊";
  const type = firstTrend?.type ?? "info";
  const comparison = firstTrend?.comparison;
  const topPriority = group.recos.length > 0
    ? group.recos.reduce((best, r) => (r.priority < best ? r.priority : best), group.recos[0].priority)
    : null;

  return (
    <div
      className={`rounded-[var(--radius-lg)] border ${TREND_STYLE[type] ?? TREND_STYLE.info} overflow-hidden`}
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <span className="text-lg flex-shrink-0">{emoji}</span>
        <div className="flex-1 min-w-0">
          <span className={`text-sm font-normal ${TREND_TITLE_COLOR[type] ?? ""}`}>
            {title}
          </span>
          {comparison && (
            <span className="text-[10px] text-[var(--color-body)] ml-2">{comparison}</span>
          )}
        </div>
        <span
          className="text-xs text-[var(--color-body)] transition-transform duration-200 flex-shrink-0"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pl-[3.25rem] space-y-3">
          {group.trends.map((trend, i) => (
            <div key={`t-${i}`}>
              {i > 0 && (
                <p className={`text-sm font-normal mb-1 ${TREND_TITLE_COLOR[trend.type] ?? ""}`}>
                  {trend.emoji} {trend.title}
                  {trend.comparison && (
                    <span className="text-[10px] text-[var(--color-body)] ml-2">{trend.comparison}</span>
                  )}
                </p>
              )}
              <ul className="space-y-0.5">
                {trend.bullets.map((b, j) => (
                  <li key={j} className="text-sm text-[var(--color-body)] flex items-start gap-1.5">
                    <span className="text-[5px] text-[var(--color-body)]/40 mt-2">●</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              {trend.confidence && (
                <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-[var(--radius-sm)] mt-1 ${CONFIDENCE_STYLE[trend.confidence] ?? ""}`}>
                  {CONFIDENCE_LABEL[trend.confidence]}
                </span>
              )}
            </div>
          ))}
          {group.recos.length > 0 && (
            <div className="pt-2 border-t border-[var(--color-border)]/30 dark:border-white/5 space-y-1.5">
              {group.recos.map((reco, i) => (
                <div key={`r-${i}`} className="flex items-start gap-2">
                  <span className="text-sm flex-shrink-0">{reco.emoji}</span>
                  <p className="text-sm text-[var(--color-heading)] dark:text-white flex-1">{reco.text}</p>
                  <span className={`text-[10px] font-normal px-1.5 py-0.5 rounded-[var(--radius-sm)] border flex-shrink-0 ${PRIORITY_STYLE[reco.priority] ?? PRIORITY_STYLE.P3}`}>
                    {reco.priority}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AiWorkoutSuggestion({ children }: { children?: React.ReactNode }) {
  const { data, loading, error } = useAiInsightsData();

  if (error || (!loading && !data)) return null;

  if (loading) return <SkeletonSection lines={4} />;

  if (!data) return null;

  return (
    <WorkoutItem suggestion={data.workoutSuggestion} cached={data.cached} generatedAt={data.generatedAt}>
      {children}
    </WorkoutItem>
  );
}

const CONFIDENCE_LABEL: Record<string, string> = {
  haute: "Confiance haute",
  moyenne: "Confiance moyenne",
  basse: "Peu de données",
};

const CONFIDENCE_STYLE: Record<string, string> = {
  haute: "text-[#1f7a3a] dark:text-[#6ee7a0] bg-[#34c759]/10",
  moyenne: "text-[#8a6d00] dark:text-[#ffd60a] bg-[#ffcc00]/10",
  basse: "text-[var(--color-body)] bg-[var(--color-border)]/30",
};

const CATEGORY_LABEL: Record<string, string> = {
  sommeil: "Sommeil",
  "récupération": "Récupération",
  "activité": "Activité",
  nutrition: "Nutrition",
};

function TrendItem({ trend }: { trend: AiTrend }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`rounded-[var(--radius-lg)] border ${TREND_STYLE[trend.type] ?? TREND_STYLE.info} overflow-hidden`}
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <span className="text-lg flex-shrink-0">{trend.emoji}</span>
        <div className="flex-1 min-w-0">
          <h3 className={`text-sm font-normal ${TREND_TITLE_COLOR[trend.type] ?? ""}`}>
            {trend.title}
          </h3>
          {trend.comparison && (
            <span className="text-[10px] text-[var(--color-body)]">{trend.comparison}</span>
          )}
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded-[var(--radius-sm)] text-[var(--color-body)] bg-[var(--color-border)]/20 flex-shrink-0">
          {CATEGORY_LABEL[trend.category] ?? trend.category}
        </span>
        <span
          className="text-xs text-[var(--color-body)] transition-transform duration-200 flex-shrink-0"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pl-[3.25rem]">
          <ul className="space-y-1">
            {trend.bullets.map((b, i) => (
              <li key={i} className="text-sm text-[var(--color-body)] flex items-start gap-2">
                <span className="text-[var(--color-body)]/40 mt-1.5 text-[6px]">●</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          {trend.confidence && (
            <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-[var(--radius-sm)] mt-2 ${CONFIDENCE_STYLE[trend.confidence] ?? ""}`}>
              {CONFIDENCE_LABEL[trend.confidence] ?? trend.confidence}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const PRIORITY_STYLE: Record<string, string> = {
  P1: "text-[#c0271e] dark:text-[#ff8a80] bg-[#ff3b30]/10 border-[#ff3b30]/20",
  P2: "text-[#8a6d00] dark:text-[#ffd60a] bg-[#ffcc00]/10 border-[#ffcc00]/20",
  P3: "text-[var(--color-body)] bg-[var(--color-border)]/20 border-[var(--color-border)]",
};


function WorkoutItem({
  suggestion,
  cached,
  generatedAt,
  children,
}: {
  suggestion: AiWorkoutReco;
  cached: boolean;
  generatedAt: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const intensity = suggestion.intensity.toLowerCase();

  return (
    <section
      className={`rounded-[var(--radius-lg)] border ${INTENSITY_BG[intensity] ?? INTENSITY_BG["modérée"]} overflow-hidden h-full`}
      style={{ boxShadow: "var(--shadow-ambient)" }}
    >
      <h2 className="text-xs uppercase tracking-wide text-[var(--color-body)] font-normal px-5 pt-5">
        Séance suggérée
      </h2>
      <div className="px-5 pb-4">
        <div className="flex items-start gap-3">
          <span className="text-3xl flex-shrink-0">{suggestionIcon(suggestion.type, intensity)}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h3 className="font-normal text-base text-[var(--color-heading)] dark:text-white">
                {displayWorkoutType(suggestion.type)}
              </h3>
              <span
                className={`text-xs font-normal px-2 py-0.5 rounded-[var(--radius-sm)] border ${INTENSITY_COLOR[intensity] ?? INTENSITY_COLOR["modérée"]}`}
              >
                {suggestion.intensity}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-[var(--color-body)]">
                {/^\d+$/.test(suggestion.duration) ? `${suggestion.duration} min` : suggestion.duration}
              </p>
              {SPORTIGO_ENABLED && displayWorkoutType(suggestion.type) === "Musculation" && (
                <MusculationBookButton />
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="text-xs text-[var(--color-body)] hover:text-[var(--color-heading)] mt-2 flex items-center gap-1 transition-colors"
        >
          <span
            className="transition-transform duration-200 inline-block"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
          >
            ▾
          </span>
          {open ? "Moins" : "Détails"}
        </button>
      </div>
      {open && (
        <div className="px-5 pb-5 pt-0">
          {suggestion.reason && (
            <p className="text-sm text-[var(--color-body)] mb-3">{suggestion.reason}</p>
          )}
          {suggestion.factors.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestion.factors.map((f, i) => (
                <span
                  key={i}
                  className="text-[10px] px-2 py-0.5 rounded-[var(--radius-sm)] bg-white/60 dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 text-[var(--color-label)] dark:text-white/60"
                >
                  {f}
                </span>
              ))}
            </div>
          )}
          {cached && (
            <p className="text-[10px] text-[var(--color-body)]/50 mt-3 text-right">
              Généré {formatRelative(generatedAt)}
            </p>
          )}
        </div>
      )}
      {children && (
        <SuggestionDetailsContext.Provider value={open}>
          <div className="px-5 pb-4 -mt-2">{children}</div>
        </SuggestionDetailsContext.Provider>
      )}
    </section>
  );
}

const SKELETON_WIDTHS = ["85%", "92%", "78%", "95%"];

function SkeletonSection({ lines }: { lines: number }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] dark:border-white/10 p-5 animate-pulse">
      <div className="h-3 w-32 bg-[var(--color-border)] dark:bg-white/10 rounded mb-4" />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 bg-[var(--color-border)] dark:bg-white/10 rounded mb-2"
          style={{ width: SKELETON_WIDTHS[i % SKELETON_WIDTHS.length] }}
        />
      ))}
    </div>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}
