// Fuseau horaire de l'utilisateur : celui de son téléphone au dernier envoi.
//
// Les jours de daily_metrics sont datés en heure locale du téléphone (c'est
// ce qu'envoie Health Auto Export). Pour que "aujourd'hui", les séances du
// jour et les heures de coucher tombent sur les mêmes jours en voyage, le
// dashboard suit ce fuseau au lieu d'Europe/Paris figé.
//
// Source : le minuit local du dernier jour reçu (hr_hourly.start, en UTC).
// Même décalage que Paris → "Europe/Paris" (gère l'heure d'été sur
// l'historique) ; sinon décalage fixe ("+08:00"), que Intl sait utiliser.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { DEFAULT_TZ, tzOffsetMs } from "@/lib/dates";

type Client = SupabaseClient<Database>;

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const m = String(abs % 60).padStart(2, "0");
  return `${sign}${h}:${m}`;
}

export async function getUserTz(supabase: Client): Promise<string> {
  const { data, error } = await supabase
    .from("daily_metrics")
    .select("date, hr_hourly")
    .not("hr_hourly", "is", null)
    .order("date", { ascending: false })
    .limit(1);
  if (error) return DEFAULT_TZ;

  const row = data?.[0];
  const start = (row?.hr_hourly as { start?: string } | null)?.start;
  if (!row || !start) return DEFAULT_TZ;

  const offsetMin = Math.round((Date.parse(`${row.date}T00:00:00Z`) - Date.parse(start)) / 60000);
  if (!Number.isFinite(offsetMin) || Math.abs(offsetMin) > 14 * 60) return DEFAULT_TZ;

  const homeOffsetMin = Math.round(tzOffsetMs(new Date(), DEFAULT_TZ) / 60000);
  return offsetMin === homeOffsetMin ? DEFAULT_TZ : formatOffset(offsetMin);
}
