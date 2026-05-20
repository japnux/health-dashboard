import { createClient as createBaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

// Client Supabase service role — bypass RLS, à n'utiliser QUE côté serveur
// (MCP route, jobs, fonctions admin). Ne jamais exposer la service role key
// au navigateur.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL manquante",
    );
  }
  return createBaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
