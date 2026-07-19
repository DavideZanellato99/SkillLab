/* Matching condiviso per la barra di ricerca di DataTable. */

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

/** Match case/accent-insensitive: true se `query` è contenuta in almeno uno dei valori */
export function matchesSearch(query: string, ...values: (string | null | undefined)[]): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  return values.some((v) => v != null && normalize(v).includes(q));
}
