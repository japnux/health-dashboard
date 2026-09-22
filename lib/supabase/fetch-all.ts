// Lecture de toutes les lignes d'une requête, par pages de 1000 : l'API
// Supabase (PostgREST) tronque silencieusement au-delà de 1000 lignes.

const PAGE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * `page(from, to)` doit renvoyer la requête bornée par `.range(from, to)`,
 * avec un tri stable (ex. .order("date")) pour que les pages se suivent.
 */
export async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}
