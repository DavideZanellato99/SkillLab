/* Dove stanno le tappe sulla mappa di un percorso, e per che tratto il
 * sentiero è già stato camminato.
 *
 * Il conto sta in un file suo e non dentro il disegno perché è l'unica parte
 * della mappa che si può sbagliare in silenzio: un nodo fuori posto o un
 * tratto acceso di troppo direbbero che il percorso è più avanti di dove è,
 * e da un SVG non lo si vede leggendo.
 *
 * Le coordinate sono in due unità diverse, ed è voluto: la `x` è una
 * percentuale della larghezza disponibile, così il sentiero si allarga con la
 * finestra, la `y` è in pixel, perché la distanza fra due tappe deve restare
 * quella anche su uno schermo stretto. Chi disegna mette insieme le due cose
 * con un viewBox che non conserva le proporzioni (vedi PathTrailMap). */

/** Un nodo della mappa: la `x` in percentuale, la `y` in pixel. */
export interface TrailNode {
  x: number
  y: number
}

/** Quanto scende il sentiero da una tappa alla successiva. */
export const ROW_HEIGHT = 138

/** Aria sopra la prima tappa e sotto l'ultima, per il nome che le sta sotto. */
const TOP_PAD = 64
const BOTTOM_PAD = 92

/** Di quanto il sentiero si scosta dal centro, in percentuale della larghezza. */
const SWING = 26

/** Il cerchio di una tappa, e quello più grande della tappa aperta adesso. */
export const NODE_SIZE = 64
export const ACTIVE_NODE_SIZE = 72

/** La grossezza del sentiero. */
export const TRAIL_STROKE = 14

/**
 * Le riduzioni disponibili, dalla vista d'insieme alla misura piena.
 *
 * Rimpicciolire tocca solo l'altezza, perché la `x` è una percentuale: il
 * sentiero resta largo quanto la finestra e a stringersi sono le distanze fra
 * le tappe, che è l'unica direzione in cui una mappa di questa forma può
 * mostrare più cose. Sotto 0.8 i nomi sotto ai nodi non ci stanno più, e a
 * quel punto è chi disegna a doverli togliere invece di lasciarli illeggibili.
 */
export const ZOOM_LEVELS = [0.5, 0.65, 0.8, 1]

/** Da qui in giù i nomi delle tappe non si leggono più. */
export const ZOOM_WITH_LABELS = 0.8

const round = (n: number) => Math.round(n * 100) / 100

/**
 * I nodi in fila, uno per riga, su un'onda che si scosta dal centro a destra
 * e a sinistra.
 *
 * Una tappa per riga e non due o tre affiancate: le righe piene andrebbero
 * lette a serpentina, cioè da sinistra a destra e poi al contrario, e in
 * quella forma la seconda riga inizia dove finisce la prima invece che da
 * dove si comincia a leggere. Con una tappa per riga la direzione è una sola,
 * verso il basso, ed è quella in cui si scorre la mappa.
 *
 * Lo `zoom` moltiplica le distanze e non le proporzioni: è il conto stesso a
 * farsi più corto, invece di un `transform` che rimpicciolisce un disegno già
 * fatto. Così le posizioni restano in pixel veri, e chi deve portare una
 * tappa al centro della finestra la trova dove il conto dice che sia.
 */
export function trailNodes(count: number, zoom = 1): TrailNode[] {
  return Array.from({ length: count }, (_, i) => ({
    x: round(50 + SWING * Math.sin((i * Math.PI) / 2)),
    y: round((TOP_PAD + i * ROW_HEIGHT) * zoom),
  }))
}

/** L'altezza che la mappa occupa, nella stessa unità della `y` dei nodi. */
export function trailHeight(count: number, zoom = 1): number {
  if (count === 0) return 0
  return round((TOP_PAD + (count - 1) * ROW_HEIGHT + BOTTOM_PAD) * zoom)
}

/**
 * Il tracciato che passa per tutti i nodi, come stringa `d` di un path SVG.
 *
 * Ogni tratto è una curva con i due punti di controllo a metà altezza fra le
 * tappe che unisce: è quello che dà la curva a esse, e che tiene il sentiero
 * verticale nei pressi di ogni nodo, dove ci sta sopra un cerchio.
 */
export function trailPath(nodes: TrailNode[]): string {
  if (nodes.length === 0) return ''
  return nodes.slice(1).reduce((d, node, i) => {
    const prev = nodes[i]
    const mid = (prev.y + node.y) / 2
    return `${d} C ${prev.x} ${mid}, ${node.x} ${mid}, ${node.x} ${node.y}`
  }, `M ${nodes[0].x} ${nodes[0].y}`)
}

/**
 * Fin dove arriva la luce sul sentiero, come altezza in pixel.
 *
 * **Un tratto si accende quando la tappa a cui porta si sblocca**, cioè nel
 * momento in cui si supera quella prima di lei: chiusa la tappa 1 si illumina
 * la strada dalla 1 alla 2, e non un centimetro oltre. Con niente di superato
 * il sentiero è tutto spento.
 *
 * È un'altezza e non una frazione della lunghezza del tracciato, ed è il
 * punto: una frazione va misurata lungo una curva, e quella misura dipende da
 * quanto lo schermo ha stirato il disegno in larghezza. Il sentiero però
 * scende sempre, quindi «fin dove» è una riga orizzontale, che lo stiramento
 * non tocca. Prima il taglio era un `stroke-dasharray` normalizzato con
 * `pathLength`, e fra le due misure ballava al punto che il fondo del
 * sentiero risultava acceso a percorso appena cominciato.
 */
export function litUntil(nodes: TrailNode[], completed: number): number {
  if (completed <= 0 || nodes.length === 0) return 0
  return nodes[Math.min(completed, nodes.length - 1)].y
}
