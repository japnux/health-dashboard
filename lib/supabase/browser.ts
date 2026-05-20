import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types";

// Client Supabase pour Client Components (auth flow magic link, etc.)
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
