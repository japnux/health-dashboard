import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Callback Supabase pour Google OAuth / PKCE.
// Vérifie la whitelist email après échange du code.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=code-manquant", request.url),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url),
    );
  }

  // Vérification whitelist : seuls les emails autorisés passent.
  const allowList = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (allowList.length > 0) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const email = user?.email?.toLowerCase() ?? "";

    if (!allowList.includes(email)) {
      // Déconnexion immédiate si email non autorisé.
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL("/login?error=email-non-autorise", request.url),
      );
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
