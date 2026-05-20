import { cookies } from "next/headers";
import { createHash } from "crypto";
import { redirect, notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { BIOMARKERS_BY_KEY } from "@/lib/biomarkers";
import { MarqueurClient } from "./client";

export const dynamic = "force-dynamic";

async function isAuthenticated(): Promise<boolean> {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return false;
  const expected = createHash("sha256")
    .update(pw + "-hd-session")
    .digest("hex");
  const cookieStore = await cookies();
  return cookieStore.get("hd_session")?.value === expected;
}

type Props = { params: Promise<{ key: string }> };

export default async function MarqueurPage({ params }: Props) {
  if (!(await isAuthenticated())) redirect("/login");

  const { key } = await params;
  const def = BIOMARKERS_BY_KEY.get(key);
  if (!def) notFound();

  const supabase = createServiceClient();

  const { data } = await supabase
    .from("blood_test_results")
    .select("value, unit, ref_min, ref_max, blood_tests!inner(test_date, lab_name)")
    .eq("biomarker_key", key)
    .order("blood_tests(test_date)", { ascending: true });

  const history = (data ?? []).map((r: Record<string, unknown>) => {
    const bt = r.blood_tests as { test_date: string; lab_name: string | null };
    return {
      date: bt.test_date,
      lab: bt.lab_name,
      value: r.value as number,
      unit: r.unit as string,
      ref_min: r.ref_min as number | null,
      ref_max: r.ref_max as number | null,
    };
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <MarqueurClient
        biomarkerKey={key}
        label={def.label}
        category={def.category}
        unit={def.unit}
        refMin={def.refMin}
        refMax={def.refMax}
        lowerIsBetter={def.lowerIsBetter ?? false}
        description={def.desc ?? null}
        history={history}
      />
    </main>
  );
}
