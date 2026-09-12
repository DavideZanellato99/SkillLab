/* Come si riconosce un testo tagliato, e cosa è stato tagliato.
 *
 * Lo leggono in due: il tooltip, che con `truncateOnly` compare solo su un
 * testo che non si legge per intero, e la cella di una tabella, che mostra da
 * sé quello che ha tagliato. Sta fuori da tutti e due perché è la stessa
 * regola, e due copie divergerebbero alla prima modifica. */

/* Troncato = il contenuto reale non entra nello spazio visibile, in larghezza
 * o in altezza. Il primo confronto è quello di `.truncate`, che tiene il testo
 * su una riga sola e lo taglia con i puntini; il secondo è quello di
 * `line-clamp-*`, che di righe ne lascia vedere due o tre e taglia in basso.
 *
 * Senza il confronto sull'altezza un testo tagliato in basso non poteva usare
 * `truncateOnly`: restava senza tooltip quando era tagliato davvero, oppure,
 * se glielo si metteva comunque, lo mostrava anche sulle descrizioni corte,
 * ripetendo parola per parola quello che si stava già leggendo. */
const isClipped = (el: Element) =>
  el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1

/* Il segno che un elemento porta il proprio tooltip. Lo mette il tooltip
 * stesso su quello che avvolge, e serve a chi ne ha uno più esterno per
 * lasciargli il suo pezzo: la cella di una tabella mostra da sé il testo che
 * ha tagliato, ma il registro delle operazioni dentro la sua cella porta un
 * tooltip che dice più del testo, e quello ha la precedenza. */
export const TOOLTIP_MARK = 'data-tooltip'

/* Se un pezzo dentro `root` sta sotto un tooltip suo, cioè uno che non è
 * quello di `root`. */
const hasOwnTooltip = (root: Element, el: Element) => {
  const carrier = el.closest(`[${TOOLTIP_MARK}]`)
  return carrier !== null && carrier !== root && root.contains(carrier)
}

/* I pezzi tagliati dentro un elemento, lui compreso, lasciando fuori quelli
 * che hanno un tooltip loro.
 *
 * Il taglio si cerca anche nei testi dentro l'elemento, non solo su di lui:
 * quando il tooltip è agganciato al riquadro che contiene il testo, a non
 * entrare sono le righe dentro, mentre il riquadro sta nella sua misura e da
 * solo direbbe sempre che non c'è niente di tagliato. Serve dove l'area che
 * risponde al mouse è più larga del testo, come nelle tappe di un percorso,
 * che si passano sopra come un riquadro solo. */
const clippedWithin = (el: Element) =>
  [el, ...Array.from(el.querySelectorAll('*'))].filter(
    (c) => isClipped(c) && (c === el || !hasOwnTooltip(el, c)),
  )

export const isTruncated = (el: Element) => clippedWithin(el).length > 0

/* I testi che dentro un elemento sono stati tagliati, per intero, uno per
 * ogni pezzo tagliato. Serve a chi vuole mostrare nel tooltip esattamente
 * quello che non si legge, senza saperlo in anticipo: la cella di una
 * tabella, che il testo lo riceve da chi la disegna.
 *
 * Si prendono solo i pezzi più interni: quando un riquadro e il testo dentro
 * risultano tagliati tutti e due, il testo è quello che conta, e il riquadro
 * lo ripeterebbe insieme a tutto il resto che contiene. */
export function clippedTexts(el: Element): string[] {
  const clipped = clippedWithin(el)
  const innermost = clipped.filter(
    (c) => !clipped.some((other) => other !== c && c.contains(other)),
  )
  const texts = innermost.map((c) => c.textContent?.trim() ?? '').filter(Boolean)
  return Array.from(new Set(texts))
}
