import { createServiceClient } from "@/lib/supabase/service";

// Tarifs Anthropic (USD par million de tokens)
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4.00 },
  "claude-sonnet-4-6": { input: 3.00, output: 15.00 },
  "claude-opus-4-6": { input: 15.00, output: 75.00 },
};

// Fallback pour modèles inconnus → tarif Haiku
const DEFAULT_PRICING = { input: 0.80, output: 4.00 };

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
  const cost = computeCost(params.model, params.inputTokens, params.outputTokens);
  const supabase = createServiceClient();
  // Fire-and-forget — on ne bloque pas la réponse
  supabase
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
}
