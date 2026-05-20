import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { logApiUsage } from "@/lib/api-usage";

async function isAuthenticated(): Promise<boolean> {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return false;
  const expected = createHash("sha256")
    .update(pw + "-hd-session")
    .digest("hex");
  const cookieStore = await cookies();
  return cookieStore.get("hd_session")?.value === expected;
}

// ── Food library : résolution locale sans appel IA ──

/** Parse "poulet grillé 200g, riz 150g" → [{name, grams}] */
function parseHintItems(hint: string): { name: string; grams: number | null }[] {
  return hint
    .split(/[,;]+/)
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return null;
      // Extraire quantité optionnelle : "200g", "200 g"
      const qtyMatch = trimmed.match(/(\d+)\s*g\b/i);
      const grams = qtyMatch ? parseInt(qtyMatch[1], 10) : null;
      // Retirer la quantité et les mots de liaison pour garder le nom
      const name = trimmed
        .replace(/\d+\s*g\b/i, "")
        .replace(/^\s*de\s+/i, "")
        .trim();
      return name ? { name, grams } : null;
    })
    .filter((item): item is { name: string; grams: number | null } => item !== null);
}

/**
 * Tente de résoudre TOUS les aliments du hint depuis food_library.
 * Retourne un MealAnalysis complet si tout est trouvé, null sinon (→ fallback IA).
 */
async function resolveFromLibrary(
  supabase: ReturnType<typeof createServiceClient>,
  hint: string,
): Promise<MealAnalysis | null> {
  const items = parseHintItems(hint);
  if (items.length === 0) return null;

  const composants: MealComponent[] = [];

  for (const item of items) {
    const normalized = item.name.toLowerCase().trim();
    const { data } = await supabase
      .from("food_library")
      .select("*")
      .eq("name_normalized", normalized)
      .single();

    if (!data) return null; // Aliment inconnu → fallback IA

    const grams = item.grams ?? data.default_portion_g;
    const ratio = grams / 100;

    composants.push({
      nom: data.name,
      quantite_g: grams,
      calories: Math.round(data.calories_per_100g * ratio),
      proteines_g: Math.round(data.proteines_per_100g * ratio * 10) / 10,
      glucides_g: Math.round(data.glucides_per_100g * ratio * 10) / 10,
      lipides_g: Math.round(data.lipides_per_100g * ratio * 10) / 10,
    });

    // Incrémenter usage_count
    await supabase
      .from("food_library")
      .update({
        usage_count: (data.usage_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("name_normalized", normalized);
  }

  const total = {
    calories: composants.reduce((s, c) => s + c.calories, 0),
    proteines_g: Math.round(composants.reduce((s, c) => s + c.proteines_g, 0) * 10) / 10,
    glucides_g: Math.round(composants.reduce((s, c) => s + c.glucides_g, 0) * 10) / 10,
    lipides_g: Math.round(composants.reduce((s, c) => s + c.lipides_g, 0) * 10) / 10,
  };

  return {
    composants,
    total,
    confiance: "haute",
    note: "Résolu depuis la bibliothèque alimentaire (sans appel IA)",
  };
}

const SYSTEM_PROMPT = `Tu es un nutritionniste expert en analyse visuelle d'aliments.

Analyse la photo de ce repas et retourne UNIQUEMENT un objet JSON valide, sans markdown, sans explication.

Format de réponse :
{
  "composants": [
    {
      "nom": "string",
      "quantite_g": number,
      "calories": number,
      "proteines_g": number,
      "glucides_g": number,
      "lipides_g": number
    }
  ],
  "total": {
    "calories": number,
    "proteines_g": number,
    "glucides_g": number,
    "lipides_g": number
  },
  "confiance": "haute" | "moyenne" | "basse",
  "note": "string ou null"
}

Règles :
- Estime les grammages à partir des proportions visuelles et d'une assiette standard (22-26cm)
- Si un aliment est ambigu, choisis l'option la plus probable et mentionne-le dans note
- confiance = basse si le plat est très composé ou partiellement visible
- Ajoute une fourchette basse/haute dans note si confiance est basse ou moyenne
- Ne jamais retourner autre chose que le JSON`;

export type MealComponent = {
  nom: string;
  quantite_g: number;
  calories: number;
  proteines_g: number;
  glucides_g: number;
  lipides_g: number;
};

export type MealAnalysis = {
  composants: MealComponent[];
  total: {
    calories: number;
    proteines_g: number;
    glucides_g: number;
    lipides_g: number;
  };
  confiance: "haute" | "moyenne" | "basse";
  note: string | null;
};

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Clé API Anthropic non configurée" }, { status: 500 });
  }

  let imageBase64: string | null = null;
  let mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" = "image/jpeg";
  let userHint = "";
  let date = "";

  try {
    const formData = await request.formData();
    const file = formData.get("photo") as File | null;
    userHint = (formData.get("hint") as string | null)?.trim() || "";
    date = (formData.get("date") as string | null) || new Date().toISOString().slice(0, 10);

    if (!file && !userHint) {
      return NextResponse.json({ error: "Photo ou description requise" }, { status: 400 });
    }

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      imageBase64 = buffer.toString("base64");

      const typeMap: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
        "image/jpeg": "image/jpeg",
        "image/jpg": "image/jpeg",
        "image/png": "image/png",
        "image/webp": "image/webp",
        "image/gif": "image/gif",
      };
      mediaType = typeMap[file.type] ?? "image/jpeg";
    }
  } catch {
    return NextResponse.json({ error: "Erreur lecture données" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // ── Food library lookup (mode texte sans photo) ──
  // Tente de résoudre les aliments depuis la DB avant d'appeler l'IA
  if (!imageBase64 && userHint) {
    const libraryResult = await resolveFromLibrary(supabase, userHint);
    if (libraryResult) {
      const label = libraryResult.composants.map((c) => c.nom).join(", ");
      await supabase.from("meal_logs").insert({
        date,
        label,
        source: "library",
        calories: Math.round(libraryResult.total.calories),
        proteines_g: Math.round(libraryResult.total.proteines_g),
        glucides_g: Math.round(libraryResult.total.glucides_g),
        lipides_g: Math.round(libraryResult.total.lipides_g),
        composants: libraryResult.composants,
        confiance: libraryResult.confiance,
      });
      return NextResponse.json(libraryResult);
    }
  }

  // ── Appel IA (photo ou texte non résolu) ──
  try {
    const client = new Anthropic({ apiKey });

    const userContent: Anthropic.MessageCreateParams["messages"][0]["content"] = [];
    if (imageBase64) {
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: imageBase64 },
      });
    }
    const textParts = imageBase64 ? "Analyse ce repas." : "Analyse ce repas à partir de ma description.";
    const fullText = textParts + (userHint ? `\n\nPrécisions : ${userHint}` : "");
    userContent.push({ type: "text", text: fullText });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    logApiUsage({
      endpoint: "meal-photo",
      model: "claude-haiku-4-5-20251001",
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    const rawText = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonStr = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let parsed: MealAnalysis;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("[meal-photo] JSON parse failed:", rawText.slice(0, 500));
      return NextResponse.json({ error: "Réponse IA invalide" }, { status: 502 });
    }

    const label = parsed.composants.map((c) => c.nom).join(", ");

    // Sauvegarder le repas
    await supabase.from("meal_logs").insert({
      date,
      label,
      source: imageBase64 ? "photo" : "text",
      calories: Math.round(parsed.total.calories),
      proteines_g: Math.round(parsed.total.proteines_g),
      glucides_g: Math.round(parsed.total.glucides_g),
      lipides_g: Math.round(parsed.total.lipides_g),
      composants: parsed.composants,
      confiance: parsed.confiance,
    });

    // Enrichir la food library avec les nouveaux composants
    for (const c of parsed.composants) {
      if (c.quantite_g > 0) {
        const normalized = c.nom.toLowerCase().trim();
        const per100 = {
          cal: Math.round(c.calories / c.quantite_g * 100 * 10) / 10,
          p: Math.round(c.proteines_g / c.quantite_g * 100 * 10) / 10,
          g: Math.round(c.glucides_g / c.quantite_g * 100 * 10) / 10,
          l: Math.round(c.lipides_g / c.quantite_g * 100 * 10) / 10,
        };
        const { data: existing } = await supabase
          .from("food_library")
          .select("usage_count")
          .eq("name_normalized", normalized)
          .single();

        if (existing) {
          await supabase
            .from("food_library")
            .update({
              calories_per_100g: per100.cal,
              proteines_per_100g: per100.p,
              glucides_per_100g: per100.g,
              lipides_per_100g: per100.l,
              default_portion_g: Math.round(c.quantite_g),
              usage_count: (existing.usage_count ?? 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("name_normalized", normalized);
        } else {
          await supabase.from("food_library").insert({
            name: c.nom,
            name_normalized: normalized,
            calories_per_100g: per100.cal,
            proteines_per_100g: per100.p,
            glucides_per_100g: per100.g,
            lipides_per_100g: per100.l,
            default_portion_g: Math.round(c.quantite_g),
            source: "ai",
            usage_count: 1,
          });
        }
      }
    }

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("[meal-photo] API error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
