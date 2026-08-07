/* Lo spostamento di un elemento dentro un elenco, senza toccare l'originale.
 *
 * Accanto a `MoveControls`, che sono le frecce con cui lo si comanda, ma in
 * un file a parte: lo stesso calcolo serve al super admin che dispone i passi
 * di una domanda di ordinamento e all'operatore che li dispone durante il
 * test, e in mezzo passa anche da chi non disegna nessuna freccia. */

/** Lo stesso elenco con un elemento portato da una posizione a un'altra. */
export function moved<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
