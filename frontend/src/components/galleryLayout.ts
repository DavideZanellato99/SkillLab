/* Le misure delle due gallerie: quella degli avatar e quella dei test
 * tecnici.
 *
 * Sono due schermate che si aprono dalla stessa barra e si comportano allo
 * stesso modo, cioè una testata, una ricerca, delle pastiglie e una griglia
 * di tessere. La griglia era scritta in un posto solo finché la galleria era
 * una sola: tenerne due copie vorrebbe dire due griglie che a un certo punto
 * non si somigliano più, con le colonne che cambiano larghezza passando da
 * una schermata all'altra.
 *
 * La griglia si riempie da sé invece di contare le colonne: a 1400px stanno
 * quattro tessere, sul portatile tre, e nessuno deve scrivere le soglie. */

export const galleryGridCls =
  'grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8 p-2 max-md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] max-md:gap-4 max-[480px]:grid-cols-1'

/** Il grigio che scorre, per le forme che stanno al posto di quello che
 *  ancora non è arrivato. */
export const shimmerCls =
  'animate-shimmer bg-[linear-gradient(90deg,#111827_0%,rgba(255,255,255,0.05)_50%,#111827_100%)] bg-[length:200%_100%]'

/* L'ingresso a cascata era `index * 0.08s`: con venti tessere l'ultima
 * compariva dopo un secondo e mezzo, e chi cercava proprio quella guardava
 * uno spazio vuoto. Il ritardo si ferma dopo le prime file, che sono quelle
 * che l'occhio segue davvero. */
const MAX_STAGGERED = 8
const STAGGER_STEP_S = 0.05

/** Di quanto ritarda l'ingresso della tessera in posizione `index`. */
export function staggerDelay(index: number): string {
  return `${Math.min(index, MAX_STAGGERED) * STAGGER_STEP_S}s`
}
