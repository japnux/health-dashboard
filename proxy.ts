import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionToken } from "@/lib/session";

// Garde d'accès global des pages.
// Avant ce fichier, seules /biologie et /biologie/marqueur vérifiaient la
// session : l'accueil, rendu côté serveur, affichait toutes les données santé
// à un visiteur non connecté. Les routes /api gardent leur propre contrôle
// (cookie de session, ou x-api-key pour /api/auto-export), elles sont donc
// exclues du matcher.
export function proxy(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  const cookie = request.cookies.get("hd_session")?.value;

  // Sans mot de passe configuré, personne ne peut se connecter : on bloque.
  if (password && cookie === sessionToken(password)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    // Tout sauf : API, assets Next, page de login, callback OAuth, et les
    // fichiers statiques (tout chemin contenant une extension, ex. .svg).
    "/((?!api|_next/static|_next/image|login|auth|favicon.ico|.*\\..*).*)",
  ],
};
