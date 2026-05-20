import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";

async function isAuthenticated(): Promise<boolean> {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return false;
  const expected = createHash("sha256")
    .update(pw + "-hd-session")
    .digest("hex");
  const cookieStore = await cookies();
  return cookieStore.get("hd_session")?.value === expected;
}

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const supabase = createServiceClient();
  const [{ data }, { data: bodyRows }] = await Promise.all([
    supabase.from("dashboard_config").select("*").eq("id", 1).single(),
    supabase.from("body_composition").select("weight_kg").order("measured_at", { ascending: false }).limit(1),
  ]);

  const latestWeightKg = bodyRows?.[0]?.weight_kg ?? null;

  return NextResponse.json({
    ...(data ?? {
      sleep_target_min: 450,
      steps_target: 10000,
      user_age: null,
      user_sex: null,
      user_height_cm: null,
      user_objective: null,
      user_activity: null,
      user_goals: null,
      bmr_kcal: null,
      tdee_kcal: null,
      meal_slots_config: null,
      day_profiles_config: null,
    }),
    latest_weight_kg: latestWeightKg,
  });
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json();
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("dashboard_config")
    .upsert(
      {
        id: 1,
        sleep_target_min: body.sleep_target_min ?? 450,
        steps_target: body.steps_target ?? 10000,
        user_age: body.user_age ?? null,
        user_sex: body.user_sex ?? null,
        user_height_cm: body.user_height_cm ?? null,
        user_objective: body.user_objective ?? null,
        user_activity: body.user_activity ?? null,
        user_goals: body.user_goals ?? null,
        bmr_kcal: body.bmr_kcal ?? null,
        tdee_kcal: body.tdee_kcal ?? null,
        meal_slots_config: body.meal_slots_config ?? null,
        day_profiles_config: body.day_profiles_config ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
