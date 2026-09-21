// Recalcule le score de récupération de tout l'historique avec la formule
// actuelle (recoveryForDay, la même que l'import et l'accueil).
// Utile après un changement de formule, ou pour les jours importés par
// l'ancien script Python (autre formule, pas comparables).
// Usage : npx tsx scripts/recompute-recovery.ts [--dry]

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import type { Database } from "@/lib/types";
import { isoDateMinusDays } from "@/lib/dates";
import { recoveryForDay } from "@/lib/recovery-score";

// Charger .env.local manuellement (pas de dépendance dotenv)
for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf-8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}

const DRY = process.argv.includes("--dry");
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function main() {
  // Lecture paginée : l'API renvoie au plus 1000 lignes par requête
  const rows: {
    date: string;
    hrv_ms: number | null;
    resting_hr_bpm: number | null;
    sleeping_hr_bpm: number | null;
    respiratory_rate: number | null;
    sleep_total_min: number | null;
    sleep_rem_pct: number | null;
    sleep_deep_pct: number | null;
    recovery_score: number | null;
    recovery_score_basis: string | null;
  }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("daily_metrics")
      .select(
        "date, hrv_ms, resting_hr_bpm, sleeping_hr_bpm, respiratory_rate, sleep_total_min, sleep_rem_pct, sleep_deep_pct, recovery_score, recovery_score_basis",
      )
      .order("date", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`lecture daily_metrics : ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  // Sauvegarde des valeurs actuelles avant toute écriture
  const backupPath = join(tmpdir(), `recovery-backup-${Date.now()}.json`);
  if (!DRY) {
    writeFileSync(
      backupPath,
      JSON.stringify(rows.map((r) => ({ date: r.date, score: r.recovery_score, basis: r.recovery_score_basis }))),
    );
  }

  const changes: { date: string; before: string; after: string; score: number | null; basis: string }[] = [];
  for (const row of rows) {
    const from = isoDateMinusDays(row.date, 60);
    const past = rows.filter((r) => r.date >= from && r.date < row.date);
    const result = recoveryForDay(row, past);
    const same = result.score === row.recovery_score && result.basis === row.recovery_score_basis;
    if (!same) {
      changes.push({
        date: row.date,
        before: `${row.recovery_score ?? "—"} ${row.recovery_score_basis ?? ""}`.trim(),
        after: `${result.score ?? "—"} ${result.basis}`,
        score: result.score,
        basis: result.basis,
      });
    }
  }

  const scoreChanged = changes.filter((c) => c.before.split(" ")[0] !== String(c.score ?? "—"));
  console.log(`${rows.length} jours, ${changes.length} à mettre à jour (dont ${scoreChanged.length} dont le score change)`);
  for (const c of changes.slice(-15)) console.log(`  ${c.date} : ${c.before} → ${c.after}`);

  if (DRY) {
    console.log("Simulation : aucune écriture.");
    return;
  }

  for (const c of changes) {
    const { error: uError } = await supabase
      .from("daily_metrics")
      .update({ recovery_score: c.score, recovery_score_basis: c.basis as "full" | "partial" | "estimated" })
      .eq("date", c.date);
    if (uError) throw new Error(`${c.date} : ${uError.message}`);
  }
  console.log(`${changes.length} jours mis à jour. Sauvegarde des anciennes valeurs : ${backupPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
