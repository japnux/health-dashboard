import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Tarifs Anthropic (USD par million de tokens)
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-opus-4-6": { input: 5.0, output: 25.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
  "claude-opus-5": { input: 5.0, output: 25.0 },
  "claude-opus-5-5": { input: 4.0, output: 20.0 },
};

// Fallback pour modèles inconnus → tarif Haiku
const DEFAULT_PRICING = { input: 1.0, output: 5.0 };

/** Calcule le coût en USD à partir des tokens et du modèle */
export function computeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICING[model] ?? DEFAULT_PRICING;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

/** Log un appel API dans api_usage_logs (fire-and-forget) */
export function logApiUsage(params: {
  endpoint: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cached?: boolean;
}): void {
  const cost = computeCost(
    params.model,
    params.inputTokens,
    params.outputTokens,
  );
  // Après la réponse : ne la bloque pas, et n'est pas coupé quand elle part
  // (un simple appel non attendu pouvait être interrompu sur Vercel)
  after(async () => {
    const supabase = createServiceClient();
    await supabase
      .from("api_usage_logs")
      .insert({
        endpoint: params.endpoint,
        model: params.model,
        input_tokens: params.inputTokens,
        output_tokens: params.outputTokens,
        cost_usd: cost,
        cached: params.cached ?? false,
      })
      .then(({ error }) => {
        if (error) console.error("[api-usage] insert error:", error.message);
      });
  });
}
