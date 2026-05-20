import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { BIOMARKERS } from "@/lib/biomarkers";
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

const KNOWN_KEYS = BIOMARKERS.map((b) => `"${b.key}"`).join(", ");

const PARSE_PROMPT = `Tu extrais les résultats d'un bilan sanguin depuis un PDF.

Biomarqueurs connus (utilise ces clés exactes) : ${KNOWN_KEYS}

Pour chaque biomarqueur trouvé dans le PDF, retourne :
- biomarker_key : la clé du registre ci-dessus (ou une clé snake_case descriptive si le marqueur n'est pas dans la liste)
- value : la valeur numérique
- unit : l'unité telle qu'elle apparaît dans le PDF
- ref_min / ref_max : les bornes de référence OPTIMALES du PDF (pas les bornes labo standard), null si non trouvées

Extrais aussi :
- test_date : la date du bilan (format YYYY-MM-DD)
- lab_name : le nom du laboratoire
- biological_age : l'âge biologique si mentionné, null sinon

Réponds UNIQUEMENT en JSON valide, sans markdown ni backticks :
{
  "test_date": "2025-04-30",
  "lab_name": "Lucis",
  "biological_age": 29.95,
  "results": [
    { "biomarker_key": "alt", "value": 49, "unit": "U/L", "ref_min": null, "ref_max": 44 },
    ...
  ]
}`;

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Clé API Anthropic non configurée" }, { status: 500 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("pdf") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Fichier PDF requis" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: PARSE_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64 },
            },
            { type: "text", text: "Extrais tous les biomarqueurs de ce bilan sanguin." },
          ],
        },
      ],
    });

    logApiUsage({
      endpoint: "blood-tests/parse-pdf",
      model: "claude-sonnet-4-6",
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    const rawText = response.content[0].type === "text" ? response.content[0].text : "";

    // Extraction robuste du JSON
    let jsonStr = rawText.trim();
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(jsonStr);

    return NextResponse.json({
      test_date: parsed.test_date ?? null,
      lab_name: parsed.lab_name ?? null,
      biological_age: parsed.biological_age ?? null,
      results: Array.isArray(parsed.results) ? parsed.results : [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
