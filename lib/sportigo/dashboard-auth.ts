// Guard d'auth dashboard partagé par les routes /api/sportigo/*.
// Reprend exactement la même logique que les autres routes API du dashboard.

import { cookies } from "next/headers";
import { createHash } from "crypto";

export async function isDashboardAuthenticated(): Promise<boolean> {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return false;
  const expected = createHash("sha256").update(pw + "-hd-session").digest("hex");
  const cookieStore = await cookies();
  return cookieStore.get("hd_session")?.value === expected;
}
