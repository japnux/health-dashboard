"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

type MealComponent = {
  nom: string;
  quantite_g: number;
  calories: number;
  proteines_g: number;
  glucides_g: number;
  lipides_g: number;
};

type MealAnalysis = {
  composants: MealComponent[];
  total: {
    calories: number;
    proteines_g: number;
    glucides_g: number;
    lipides_g: number;
  };
  confiance: "haute" | "moyenne" | "basse";
  note: string | null;
};

const CONFIDENCE_STYLE: Record<string, string> = {
  haute: "text-[#108c3d] bg-[#15be53]/10",
  moyenne: "text-[#9b6829] bg-[#eab308]/10",
  basse: "text-[#ea2261] bg-[#ea2261]/10",
};

export function MealPhotoButton({ date, compact, label }: { date: string; compact?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 text-sm text-[var(--color-label)] dark:text-white/70 hover:border-[var(--color-brand-purple-light)] hover:text-[var(--color-brand-purple)] transition-colors"
      >
        {label ? `+ ${label}` : compact ? "📸 Photo" : "📸 Ajouter"}
      </button>
      {open && <MealPhotoModal date={date} onClose={() => setOpen(false)} />}
    </>
  );
}

type Quick = {
  label: string;
  calories: number;
  proteines_g: number;
  glucides_g: number;
  lipides_g: number;
};
const QUICK_ADDS: Quick[] = [
  { label: "Clear Whey", calories: 85,  proteines_g: 20, glucides_g: 1, lipides_g: 0 },
  { label: "Whey",       calories: 120, proteines_g: 25, glucides_g: 3, lipides_g: 1 },
];

function MealPhotoModal({ date, onClose }: { date: string; onClose: () => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [hint, setHint] = useState("");
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wheyLoading, setWheyLoading] = useState(false);

  function handleFile(f: File | null) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setAnalysis(null);
    setError(null);
  }

  async function analyze() {
    if (!file && !hint.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      if (file) {
        const compressed = await compressImage(file, 1600, 0.8);
        formData.append("photo", compressed, file.name);
      }
      if (hint.trim()) formData.append("hint", hint.trim());
      formData.append("date", date);

      const res = await fetch("/api/meal-photo", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as Record<string, string>).error ?? `Erreur ${res.status}`);
      }

      const data: MealAnalysis = await res.json();
      setAnalysis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  function confirmAndClose() {
    startTransition(() => router.refresh());
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#0d1520] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85dvh] overflow-y-auto p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-normal text-[var(--color-heading)] dark:text-white">
            🍽️ Analyser un repas
          </h2>
          <button onClick={onClose} className="text-[var(--color-body)] hover:text-[var(--color-heading)] text-lg">
            ✕
          </button>
        </div>

        {!analysis && !loading && (
          <div className="space-y-3">
            {!preview ? (
              <button
                type="button"
                onClick={() => uploadRef.current?.click()}
                className="w-full flex items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] dark:border-white/10 px-3 py-3 text-left hover:border-[var(--color-brand-purple)]/40 transition-colors"
              >
                <span className="text-lg">📷</span>
                <span className="text-sm text-[var(--color-body)]">Photo</span>
                <input
                  ref={uploadRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />
              </button>
            ) : (
              <div className="relative rounded-[var(--radius-md)] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Repas" className="w-full max-h-32 sm:max-h-48 object-cover" />
                <button
                  onClick={() => { setPreview(null); setFile(null); setAnalysis(null); }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white text-xs flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            )}

            <textarea
              value={hint}
              onChange={(e) => {
                setHint(e.target.value);
                // Auto-resize : ajuste la hauteur au contenu
                const el = e.target;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                // Cmd/Ctrl+Enter pour lancer l'analyse
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  if (file || hint.trim()) analyze();
                }
              }}
              placeholder={"Décris ton repas…\nex: poulet grillé 200g, riz basmati 150g, brocoli"}
              rows={3}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2.5 text-base sm:text-sm text-[var(--color-heading)] dark:text-white placeholder:text-[var(--color-body)]/50 focus:outline-none focus:border-[var(--color-brand-purple)]/40 resize-none leading-relaxed"
            />

            <button
              onClick={analyze}
              disabled={!file && !hint.trim()}
              className="w-full rounded-[var(--radius-md)] bg-[var(--color-brand-purple)] text-white py-2.5 text-sm font-normal hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Analyser le repas
            </button>

            <div className="pt-2 border-t border-[var(--color-border)] dark:border-white/10 flex items-center gap-2">
              <span className="text-xs text-[var(--color-body)]">Whey :</span>
              {QUICK_ADDS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  disabled={wheyLoading}
                  onClick={async () => {
                    setWheyLoading(true);
                    try {
                      const res = await fetch("/api/meal-log", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          date,
                          label: q.label,
                          source: "quick",
                          calories: q.calories,
                          proteines_g: q.proteines_g,
                          glucides_g: q.glucides_g,
                          lipides_g: q.lipides_g,
                        }),
                      });
                      if (res.ok) {
                        startTransition(() => router.refresh());
                        onClose();
                      }
                    } finally {
                      setWheyLoading(false);
                    }
                  }}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 text-sm text-[var(--color-label)] dark:text-white/70 hover:border-[var(--color-brand-purple-light)] hover:text-[var(--color-brand-purple)] transition-colors disabled:opacity-50"
                >
                  {q.label} <span className="text-[10px] text-[var(--color-body)]">{q.calories}kcal · {q.proteines_g}P</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-[var(--color-body)] py-4 justify-center">
            <span className="inline-block w-4 h-4 border-2 border-[var(--color-brand-purple)]/30 border-t-[var(--color-brand-purple)] rounded-full animate-spin" />
            Analyse en cours…
          </div>
        )}

        {error && (
          <div className="text-sm text-[#ea2261] bg-[#ea2261]/5 rounded-[var(--radius-md)] p-3">
            {error}
          </div>
        )}

        {analysis && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-[var(--color-body)]">Résultat</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-[var(--radius-sm)] ${CONFIDENCE_STYLE[analysis.confiance]}`}>
                Confiance {analysis.confiance}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <MacroCard label="Cal" value={`${analysis.total.calories}`} unit="kcal" />
              <MacroCard label="Prot" value={`${analysis.total.proteines_g}`} unit="g" highlight />
              <MacroCard label="Carb" value={`${analysis.total.glucides_g}`} unit="g" />
              <MacroCard label="Fat" value={`${analysis.total.lipides_g}`} unit="g" />
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] dark:border-white/10 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--color-border)]/30 dark:bg-white/5">
                    <th className="text-left px-3 py-2 font-normal text-[var(--color-body)]">Aliment</th>
                    <th className="text-right px-3 py-2 font-normal text-[var(--color-body)]">Qté</th>
                    <th className="text-right px-3 py-2 font-normal text-[var(--color-body)]">Prot.</th>
                    <th className="text-right px-3 py-2 font-normal text-[var(--color-body)]">Kcal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]/50 dark:divide-white/5">
                  {analysis.composants.map((c, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-[var(--color-heading)] dark:text-white">{c.nom}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--color-body)]">{c.quantite_g}g</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--color-heading)] dark:text-white">{c.proteines_g}g</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--color-body)]">{c.calories}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {analysis.note && (
              <p className="text-xs text-[var(--color-body)] bg-[var(--color-border)]/20 dark:bg-white/5 rounded-[var(--radius-md)] p-2.5">
                💡 {analysis.note}
              </p>
            )}

            <div className="text-xs text-[#108c3d] text-center">Enregistré automatiquement</div>
            <button
              onClick={confirmAndClose}
              className="w-full rounded-[var(--radius-md)] bg-[#15be53] text-white py-2.5 text-sm font-normal hover:opacity-90 transition-opacity"
            >
              OK
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function compressImage(file: File, maxDim: number, quality: number): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob ?? file),
        "image/jpeg",
        quality,
      );
    };
    img.src = URL.createObjectURL(file);
  });
}

function MacroCard({ label, value, unit, highlight }: { label: string; value: string; unit: string; highlight?: boolean }) {
  return (
    <div className={`rounded-[var(--radius-md)] p-2.5 text-center ${highlight ? "bg-[#15be53]/10 border border-[#15be53]/20" : "bg-[var(--color-border)]/20 dark:bg-white/5 border border-[var(--color-border)] dark:border-white/10"}`}>
      <div className={`text-lg font-light tabular-nums ${highlight ? "text-[#108c3d]" : "text-[var(--color-heading)] dark:text-white"}`}>
        {value}
      </div>
      <div className="text-[10px] text-[var(--color-body)]">{unit}</div>
      <div className="text-[9px] uppercase tracking-wide text-[var(--color-body)] mt-0.5">{label}</div>
    </div>
  );
}
