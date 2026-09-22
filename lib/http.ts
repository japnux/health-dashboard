// Lecture du corps JSON d'une requête : null si le corps est illisible, pour
// répondre 400 au lieu d'une erreur 500 sans message.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJson(request: Request): Promise<any | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
