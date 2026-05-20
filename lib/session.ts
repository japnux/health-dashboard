import { createHash } from "crypto";

// Dérive un token de session à partir du mot de passe.
export function sessionToken(password: string): string {
  return createHash("sha256").update(password + "-hd-session").digest("hex");
}
