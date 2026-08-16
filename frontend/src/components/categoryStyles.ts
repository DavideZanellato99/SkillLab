/* Le tinte con cui si disegna la pastiglia di una categoria di avatar.
 *
 * Un elenco chiuso, e scritto a mano, perché Tailwind compila le classi che
 * trova nel sorgente: una costruita a runtime da un colore scelto in admin
 * (`bg-${colore}-500/15`) non finirebbe mai nel CSS e la pastiglia uscirebbe
 * senza colore. L'amministratore sceglie quindi fra queste, e il backend
 * rifiuta ogni altro nome (vedi AVATAR_CATEGORY_COLORS nei models). */

export const CATEGORY_COLOR_CLASSES: Record<string, string> = {
  violet: 'bg-violet-600/15 text-violet-400',
  orange: 'bg-orange-500/15 text-orange-400',
  cyan: 'bg-cyan-500/15 text-cyan-400',
  emerald: 'bg-emerald-500/15 text-emerald-500',
  pink: 'bg-pink-500/15 text-pink-500',
  amber: 'bg-amber-500/15 text-amber-400',
  sky: 'bg-sky-500/15 text-sky-400',
  rose: 'bg-rose-500/15 text-rose-400',
  slate: 'bg-white/6 text-slate-400',
}

/** Le tinte selezionabili, nell'ordine in cui si presentano in admin. */
export const CATEGORY_COLORS = Object.keys(CATEGORY_COLOR_CLASSES)

/** Le classi della pastiglia. Una tinta sconosciuta ricade sul neutro:
 *  meglio una targhetta grigia che una senza sfondo. */
export function categoryBadgeClasses(color: string): string {
  return CATEGORY_COLOR_CLASSES[color] ?? CATEGORY_COLOR_CLASSES.slate
}

/* La stessa tinta ridotta a un pallino, per le righe dove la pastiglia è di
 * troppo: nell'elenco delle prove di una persona ogni riga ha già la
 * targhetta del canale o del tipo, e due pastiglie di fila si contendono lo
 * stesso sguardo mentre la categoria è un'informazione di contorno.
 *
 * Le tinte sono piene e non al 15%: due millimetri di colore trasparente non
 * si distinguerebbero l'uno dall'altro. Scritte a mano per la stessa ragione
 * di quelle sopra, cioè perché Tailwind compila solo le classi che legge. */
const CATEGORY_DOT_CLASSES: Record<string, string> = {
  violet: 'bg-violet-500',
  orange: 'bg-orange-500',
  cyan: 'bg-cyan-500',
  emerald: 'bg-emerald-500',
  pink: 'bg-pink-500',
  amber: 'bg-amber-500',
  sky: 'bg-sky-500',
  rose: 'bg-rose-500',
  slate: 'bg-slate-500',
}

/** La classe del pallino. Come la pastiglia, una tinta sconosciuta è grigia. */
export function categoryDotClass(color: string): string {
  return CATEGORY_DOT_CLASSES[color] ?? CATEGORY_DOT_CLASSES.slate
}
