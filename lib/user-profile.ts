import { createServiceClient } from "@/lib/supabase/service";

export type UserProfile = {
  age: number | null;
  sex: string | null;
  heightCm: number | null;
  objective: string | null;
  activity: string | null;
  goals: string | null;
  sleepTargetMin: number;
  stepsTarget: number;
};

export async function getUserProfile(): Promise<UserProfile> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("dashboard_config")
    .select("*")
    .eq("id", 1)
    .single();

  return {
    age: data?.user_age ?? null,
    sex: data?.user_sex ?? null,
    heightCm: data?.user_height_cm ?? null,
    objective: data?.user_objective ?? null,
    activity: data?.user_activity ?? null,
    goals: data?.user_goals ?? null,
    sleepTargetMin: data?.sleep_target_min ?? 450,
    stepsTarget: data?.steps_target ?? 10000,
  };
}

export function profileToPromptBlock(p: UserProfile): string {
  const lines: string[] = [];
  if (p.age) lines.push(`Âge : ${p.age} ans`);
  if (p.sex) lines.push(`Sexe : ${p.sex}`);
  if (p.heightCm) lines.push(`Taille : ${p.heightCm} cm`);
  if (p.objective) lines.push(`Objectif : ${p.objective}`);
  if (p.activity) lines.push(`Activité principale : ${p.activity}`);
  if (p.goals) lines.push(`Objectifs : ${p.goals}`);
  lines.push(`Objectif sommeil : ${Math.floor(p.sleepTargetMin / 60)}h${(p.sleepTargetMin % 60).toString().padStart(2, "0")}`);
  lines.push(`Objectif pas : ${p.stepsTarget}/jour`);

  if (lines.length === 0) return "";
  return `\nProfil utilisateur :\n${lines.map((l) => `- ${l}`).join("\n")}\n`;
}
