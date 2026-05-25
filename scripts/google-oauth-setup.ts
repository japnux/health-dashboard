// Script one-shot pour obtenir un refresh_token OAuth Google Calendar.
//
// Prérequis (à faire une seule fois dans la GCP Console) :
//   1. Activer l'API "Google Calendar API"
//      https://console.cloud.google.com/apis/library/calendar-json.googleapis.com
//   2. Créer un OAuth 2.0 Client ID type "Web application"
//      https://console.cloud.google.com/apis/credentials
//      - Authorized redirect URI : http://localhost:53682/callback
//   3. Sur l'OAuth consent screen, ajouter ton email comme "Test user"
//      (sinon le refresh token expire en 7j en mode "Testing").
//   4. Copier client_id + client_secret dans .env.local :
//        GOOGLE_OAUTH_CLIENT_ID=...
//        GOOGLE_OAUTH_CLIENT_SECRET=...
//
// Usage :
//   npx tsx scripts/google-oauth-setup.ts
//
// Le script ouvre ton navigateur, t'invite à te connecter avec vidal.geoffrey@gmail.com,
// récupère le code d'autorisation puis l'échange contre un refresh_token qu'il affiche.
// Tu copies ce refresh_token dans .env.local et dans Vercel :
//   GOOGLE_OAUTH_REFRESH_TOKEN=...

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { exec } from "node:child_process";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

async function main() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error(
      "Manque GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET dans .env.local",
    );
    process.exit(1);
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  console.log("Ouvre cette URL dans ton navigateur (si elle ne s'ouvre pas auto) :");
  console.log(authUrl.toString());

  // Ouvre auto le navigateur (macOS).
  exec(`open "${authUrl.toString()}"`);

  // Petit serveur HTTP local qui capte le `code`.
  const code: string = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (!req.url) return;
      const url = new URL(req.url, `http://localhost:${PORT}`);
      if (url.pathname !== "/callback") {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      const c = url.searchParams.get("code");
      const err = url.searchParams.get("error");
      if (err) {
        res.statusCode = 400;
        res.end(`Erreur OAuth: ${err}`);
        server.close();
        reject(new Error(err));
        return;
      }
      if (!c) {
        res.statusCode = 400;
        res.end("Pas de code");
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        "<h2>OK</h2><p>Tu peux fermer cet onglet et revenir au terminal.</p>",
      );
      server.close();
      resolve(c);
    });
    server.listen(PORT, () => {
      console.log(`En attente du callback sur ${REDIRECT_URI}…`);
    });
  });

  // Échange du code contre tokens.
  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!tokenResp.ok) {
    console.error("Échec exchange code:", tokenResp.status, await tokenResp.text());
    process.exit(1);
  }
  const tokens = (await tokenResp.json()) as {
    refresh_token?: string;
    access_token?: string;
    scope?: string;
    expires_in?: number;
  };

  console.log("\n=== Résultat ===");
  if (tokens.refresh_token) {
    console.log("Scopes :", tokens.scope);
    console.log("Expires in (access):", tokens.expires_in, "s");
    console.log("\nCopie cette ligne dans .env.local ET dans Vercel :");
    console.log(`\nGOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  } else {
    console.warn(
      "Pas de refresh_token retourné. C'est probablement que tu as déjà donné le consent dans le passé.",
    );
    console.warn(
      "→ Va sur https://myaccount.google.com/connections, révoque l'app, et relance ce script.",
    );
    console.log("Réponse brute :", tokens);
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
