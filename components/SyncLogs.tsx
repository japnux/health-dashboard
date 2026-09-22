"use client";

// Onglet "Journal de synchro" : état de chaque automatisation Health Auto
// Export, aide-mémoire de configuration, puis les derniers envois (filtrables,
// contenu brut chargé seulement à l'ouverture).

import { useEffect, useState } from "react";
import { VIVID } from "@/lib/palette";

type SyncLog = {
  id: string;
  created_at: string;
  source: string;
  status: string;
  summary: string;
  days_processed: number;
  workouts_processed: number;
  details: string[] | null;
  http_headers: Record<string, string> | null;
};

type Automation = { name: string; lastAt: string | null; status: string | null };
type Payload = { logs: SyncLog[]; automations: Automation[]; tz: string };

const STATUS_STYLE: Record<string, string> = {
  ok: "text-[#1f7a3a] dark:text-[#6ee7a0] bg-[#34c759]/10",
  partial: "text-[#8a6d00] dark:text-[#ffd60a] bg-[#ffcc00]/10",
  error: "text-[#c0271e] dark:text-[#ff8a80] bg-[#ff3b30]/10",
  empty: "text-[var(--color-body)] bg-[var(--color-border)]/30",
};

const STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  partial: "Partiel",
  error: "Erreur",
  empty: "Vide",
};

// Silence au-delà duquel une automatisation est signalée
const SILENCE_ALERT_H = 6;

type Filter = "all" | "Health metrics" | "Workouts" | "problems";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "Health metrics", label: "Health metrics" },
  { key: "Workouts", label: "Workouts" },
  { key: "problems", label: "Problèmes" },
];

function formatDate(iso: string, tz: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz });
}

export function SyncLogs() {
  const [data, setData] = useState<Payload | null>(null);
  // Instant du chargement : sert au calcul des silences (pas d'horloge pendant l'affichage)
  const [loadedAt, setLoadedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sync-logs")
      .then((r) => {
        if (!r.ok) throw new Error("Erreur chargement");
        return r.json() as Promise<Payload>;
      })
      .then((d) => {
        setData(d);
        setLoadedAt(Date.now());
      })
      .catch(() => setError("Impossible de charger le journal de synchro"));
  }, []);

  if (error) {
    return <div className="text-sm text-[#c0271e] dark:text-[#ff8a80] py-8 text-center">{error}</div>;
  }
  if (!data) {
    return <div className="text-sm text-[var(--color-body)] py-8 text-center">Chargement…</div>;
  }

  const nameOf = (l: SyncLog) => l.http_headers?.["automation-name"] ?? "";
  const shown = data.logs.filter((l) =>
    filter === "all" ? true : filter === "problems" ? l.status !== "ok" : nameOf(l) === filter,
  );

  return (
    <div className="space-y-4">
      <section
        className="rounded-[var(--radius-lg)] bg-white dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10 p-5 space-y-4"
        style={{ boxShadow: "var(--shadow-ambient)" }}
      >
        <h2 className="text-xs font-normal uppercase tracking-wide text-[var(--color-body)]">Automatisations</h2>
        <AutomationStatus automations={data.automations} tz={data.tz} loadedAt={loadedAt} />
        <HealthExportGuide />
      </section>

      <div className="flex gap-1 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              filter === f.key
                ? "bg-[var(--color-brand-purple)] text-white"
                : "bg-[var(--color-border)]/40 dark:bg-white/5 text-[var(--color-body)] hover:text-[var(--color-heading)] dark:hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-[var(--color-body)] py-6 text-center">
          {data.logs.length === 0
            ? "Aucune synchronisation enregistrée. Les entrées apparaîtront après le premier envoi depuis Health Auto Export."
            : "Aucun envoi pour ce filtre parmi les 30 derniers."}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((log) => (
            <LogRow
              key={log.id}
              log={log}
              tz={data.tz}
              expanded={expandedId === log.id}
              onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Dernière réception de chaque automatisation, alerte au-delà de 6 h de silence
function AutomationStatus({ automations, tz, loadedAt }: { automations: Automation[]; tz: string; loadedAt: number }) {
  return (
    <div className="space-y-2">
      {automations.map((a) => {
        const hours = a.lastAt ? (loadedAt - Date.parse(a.lastAt)) / 3_600_000 : null;
        const late = hours == null || hours > SILENCE_ALERT_H;
        return (
          <div key={a.name} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-[var(--color-label)] dark:text-white/80">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: late ? VIVID.orange : VIVID.green }} />
              {a.name}
            </span>
            <span className="text-[var(--color-body)] tabular-nums text-right">
              {a.lastAt ? `dernier envoi ${formatDate(a.lastAt, tz)}` : "jamais reçu"}
              {late && a.lastAt && <span className="block text-[11px]">silencieux depuis {Math.round(hours!)} h</span>}
              {a.status && a.status !== "ok" && <span className="block text-[11px]">statut : {STATUS_LABEL[a.status] ?? a.status}</span>}
            </span>
          </div>
        );
      })}
      <p className="text-[11px] text-[var(--color-body)]">
        Fuseau détecté : {`${tz} (celui de ton téléphone, d'après les dernières données reçues).`}
      </p>
    </div>
  );
}

// Aide-mémoire pour (re)configurer Health Auto Export sur un téléphone
function HealthExportGuide() {
  const [copied, setCopied] = useState(false);
  const endpoint = typeof window !== "undefined" ? `${window.location.origin}/api/auto-export` : "/api/auto-export";
  return (
    <details className="rounded-[var(--radius-md)] bg-[var(--color-border)]/30 dark:bg-white/5 p-3 text-sm">
      <summary className="cursor-pointer text-[var(--color-label)] dark:text-white/80">Configurer Health Auto Export</summary>
      <div className="mt-3 space-y-2 text-[var(--color-body)] text-[13px] leading-relaxed">
        <p>Deux automatisations « REST API », au format JSON :</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <span className="text-[var(--color-heading)] dark:text-white">Health metrics</span> : données de santé,
            agrégation par heure, envoi toutes les heures.
          </li>
          <li>
            <span className="text-[var(--color-heading)] dark:text-white">Workouts</span> : séances, avec les données
            de FC et les itinéraires (routes) activés.
          </li>
        </ul>
        <p>Adresse pour les deux :</p>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-xs rounded bg-black/5 dark:bg-white/10 px-2 py-1 break-all">{endpoint}</code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(endpoint).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
            className="text-xs text-[var(--color-brand-purple)] hover:underline"
          >
            {copied ? "Copié" : "Copier"}
          </button>
        </div>
        <p>
          En-tête <code className="text-xs">x-api-key</code> : la valeur de <code className="text-xs">AUTO_EXPORT_API_KEY</code>{" "}
          (variables d&apos;environnement Vercel). Garde les noms d&apos;automatisation ci-dessus : ils servent au suivi.
        </p>
      </div>
    </details>
  );
}

// Un envoi : résumé, détails au clic, contenu brut chargé seulement si demandé
function LogRow({ log, tz, expanded, onToggle }: { log: SyncLog; tz: string; expanded: boolean; onToggle: () => void }) {
  const [raw, setRaw] = useState<{ loading: boolean; value: unknown }>({ loading: false, value: undefined });

  function loadRaw() {
    setRaw({ loading: true, value: undefined });
    fetch(`/api/sync-logs?id=${log.id}`)
      .then((r) => r.json())
      .then((d: { raw_payload: unknown }) => setRaw({ loading: false, value: d.raw_payload }))
      .catch(() => setRaw({ loading: false, value: null }));
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] dark:border-white/10 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[var(--color-border)]/20 dark:hover:bg-white/5 transition-colors"
      >
        <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${STATUS_STYLE[log.status] ?? STATUS_STYLE.error}`}>
          {STATUS_LABEL[log.status] ?? log.status}
        </span>
        <span className="text-sm text-[var(--color-heading)] dark:text-white flex-1 truncate">
          {log.http_headers?.["automation-name"] ? `${log.http_headers["automation-name"]} · ` : ""}
          {log.summary}
        </span>
        <span className="text-xs text-[var(--color-body)] whitespace-nowrap">{formatDate(log.created_at, tz)}</span>
        <span className="text-[var(--color-body)] text-xs transition-transform" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }}>
          ▾
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[var(--color-border)] dark:border-white/10 pt-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <MiniInfo label="Source" value={log.source} />
            <MiniInfo label="Jours" value={String(log.days_processed)} />
            <MiniInfo label="Séances" value={String(log.workouts_processed)} />
            <MiniInfo label="Automatisation" value={log.http_headers?.["automation-name"] ?? "—"} />
          </div>

          {log.details && log.details.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-body)] mb-1">Détails</p>
              <div className="bg-[var(--color-border)]/20 dark:bg-white/5 rounded-[var(--radius-sm)] p-2.5 space-y-0.5">
                {log.details.map((d, i) => (
                  <p
                    key={i}
                    className={`text-xs font-mono ${d.includes("erreur") ? "text-[#c0271e] dark:text-[#ff8a80]" : "text-[var(--color-body)]"}`}
                  >
                    {d}
                  </p>
                ))}
              </div>
            </div>
          )}

          {raw.value === undefined ? (
            <button onClick={loadRaw} disabled={raw.loading} className="text-xs text-[var(--color-brand-purple)] hover:underline disabled:opacity-50">
              {raw.loading ? "Chargement…" : "Afficher les données brutes"}
            </button>
          ) : raw.value === null ? (
            <p className="text-xs text-[var(--color-body)]">Données brutes non conservées (envoi de plus de 60 jours).</p>
          ) : (
            <pre className="bg-[var(--color-border)]/20 dark:bg-white/5 rounded-[var(--radius-sm)] p-2.5 overflow-x-auto text-[10px] font-mono text-[var(--color-body)] max-h-64 overflow-y-auto">
              {JSON.stringify(raw.value, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[var(--color-body)]">{label} : </span>
      <span className="text-[var(--color-heading)] dark:text-white">{value}</span>
    </div>
  );
}
