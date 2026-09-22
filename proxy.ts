import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Garde d'accès global des pages.
// Avant ce fichier, seules /biologie et /biologie/marqueur vérifiaient la
// session : l'accueil, rendu côté serveur, affichait toutes les données santé
// à un visiteur non connecté. Les routes /api gardent leur propre contrôle
// (cookie de session, ou x-api-key pour /api/auto-export), elles sont donc
// exclues du matcher.
export function proxy(request: NextRequest) {
  // Jeton signé et non expiré (sans mot de passe configuré : refus)
  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    // Tout sauf : API, assets Next, page de login, et les
    // fichiers statiques (tout chemin contenant une extension, ex. .svg).
    "/((?!api|_next/static|_next/image|login|favicon.ico|.*\\..*).*)",
  ],
};
