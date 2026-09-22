// Guard d'auth dashboard partagé par les routes /api/sportigo/* : même
// contrôle de session que le reste du dashboard (lib/session.ts).

import { isAuthenticated } from "@/lib/session";

export async function isDashboardAuthenticated(): Promise<boolean> {
  return isAuthenticated();
}
