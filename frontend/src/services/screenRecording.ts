/* La registrazione dello schermo durante un test tecnico.
 *
 * Il browser chiede cosa condividere, si registra quello che l'utente
 * sceglie con `MediaRecorder`, e alla consegna il file va al server attaccato
 * al tentativo (vedi `uploadScreenRecording`). Fra l'avvio e la consegna il
 * video vive solo qui, in memoria: un test abbandonato a metà non lascia né
 * il video né le risposte.
 *
 * Si pretende lo schermo intero. Una finestra sola sarebbe una registrazione
 * che mostra il test e nasconde tutto il resto, cioè esattamente il
 * contrario di quello per cui chi amministra ha messo la spunta. Il browser
 * non lascia imporre la scelta, la si può solo suggerire (`displaySurface`),
 * quindi si guarda cosa è stato scelto dopo e si rifiuta quello che non è
 * un monitor. Dove il browser non dice cosa è stato scelto (Firefox, Safari)
 * si prende quello che arriva: rifiutare tutti i loro utenti sarebbe peggio
 * di accettare una finestra da qualcuno di loro.
 *
 * L'interruzione è dell'utente e non nostra: il browser gli mette sotto gli
 * occhi un pulsante "interrompi condivisione" per tutta la durata, e se lo
 * preme la traccia finisce. Da qui si avvisa chi ha avviato la registrazione
 * (`onInterrupted`), e sta a lui decidere cosa fare del test: il runner lo
 * consegna in quell'istante con le risposte che ci sono.
 *
 * Il bitrate è tenuto basso di proposito. Uno schermo mentre si risponde a
 * un test è quasi fermo, e cinque fotogrammi al secondo a 600 kbit/s bastano
 * a leggere cosa c'era aperto: mezz'ora di test aperto sono un centinaio di
 * megabyte, sotto il tetto di 150 MB del server (`MAX_SCREEN_RECORDING_BYTES`). */

/** Il video di un test, pronto da caricare. */
export interface ScreenRecording {
  blob: Blob
  mimeType: string
  /** Misurata a orologio: il contenitore WebM non porta la durata. */
  durationMs: number
  /** La condivisione è stata fermata dall'utente prima della consegna. */
  interrupted: boolean
}

/**
 * Perché la condivisione non è partita.
 *
 * - `unsupported`: il browser non sa condividere lo schermo o registrarlo;
 * - `refused`: l'utente ha chiuso la finestra del browser senza scegliere;
 * - `not_monitor`: ha scelto una finestra o una scheda invece dello schermo.
 */
export class ScreenShareError extends Error {
  readonly kind: ScreenShareErrorKind

  constructor(kind: ScreenShareErrorKind) {
    super(SHARE_ERROR_MESSAGES[kind])
    this.name = 'ScreenShareError'
    this.kind = kind
  }
}

export type ScreenShareErrorKind = 'unsupported' | 'refused' | 'not_monitor'

const SHARE_ERROR_MESSAGES = {
  unsupported:
    'Questo browser non consente di registrare lo schermo. Utilizza una versione recente di Chrome, Edge o Firefox da computer.',
  refused:
    'Il test richiede la registrazione dello schermo: per iniziare, consenti la condivisione quando il browser la richiede.',
  not_monitor: "Condividi l'intero schermo, non una singola finestra o scheda, e riprova.",
} as const

/* I contenitori, dal migliore in giù. Chrome, Edge e Firefox prendono i
 * WebM; Safari registra solo mp4. */
const RECORDING_MIME_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
]

const RECORDING_BITS_PER_SECOND = 600_000

/* Intervallo dei pezzi. Il file si compone comunque alla fine: serve solo a
 * non tenere un unico buffer che cresce per tutto il test. */
const RECORDING_TIMESLICE_MS = 5000

/** Quello che chi ha avviato la registrazione può ancora farci. */
export interface ScreenRecorder {
  /**
   * Ferma la registrazione e restituisce il video. Null se non è stato
   * catturato niente. Si può chiamare più volte: la promessa è la stessa.
   */
  stop: () => Promise<ScreenRecording | null>
  /** Butta via tutto senza produrre niente: si esce dal test senza consegnare. */
  cancel: () => void
}

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return RECORDING_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null
}

function canShare(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function' &&
    pickMimeType() !== null
  )
}

/**
 * Chiede lo schermo e comincia a registrarlo.
 *
 * Va chiamata dentro il gesto dell'utente (il clic su "inizia"), prima di
 * qualsiasi attesa: il browser apre la finestra di scelta solo se la
 * richiesta arriva da un clic, e un `await` di mezzo lo fa dimenticare.
 */
export async function startScreenRecording(onInterrupted: () => void): Promise<ScreenRecorder> {
  if (!canShare()) throw new ScreenShareError('unsupported')
  const mimeType = pickMimeType() as string

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'monitor',
        frameRate: { ideal: 5, max: 10 },
      },
      audio: false,
      /* Le tre opzioni che Chrome legge e gli altri ignorano: proporre il
       * monitor per primo, non offrire di cambiare cosa si condivide a
       * metà test, e non proporre la scheda corrente. Fuori dal tipo
       * standard, da qui il cast. */
      ...({
        monitorTypeSurfaces: 'include',
        surfaceSwitching: 'exclude',
        preferCurrentTab: false,
        selfBrowserSurface: 'include',
      } as object),
    })
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    throw new ScreenShareError(name === 'NotAllowedError' ? 'refused' : 'unsupported')
  }

  const track = stream.getVideoTracks()[0]
  const surface = (track?.getSettings() as { displaySurface?: string } | undefined)?.displaySurface
  if (!track || (surface !== undefined && surface !== 'monitor')) {
    stream.getTracks().forEach((t) => t.stop())
    throw new ScreenShareError('not_monitor')
  }

  const chunks: Blob[] = []
  const startedAt = Date.now()
  let interrupted = false
  let settled = false
  let resolveReady!: (value: ScreenRecording | null) => void
  const ready = new Promise<ScreenRecording | null>((resolve) => {
    resolveReady = resolve
  })

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: RECORDING_BITS_PER_SECOND,
  })
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  const settle = (value: ScreenRecording | null) => {
    if (settled) return
    settled = true
    stream.getTracks().forEach((t) => t.stop())
    resolveReady(value)
  }
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType })
    chunks.length = 0
    settle(
      blob.size > 0 ? { blob, mimeType, durationMs: Date.now() - startedAt, interrupted } : null,
    )
  }
  recorder.onerror = () => settle(null)

  const stop = () => {
    if (recorder.state !== 'inactive') recorder.stop()
    else if (!settled) settle(null)
    return ready
  }

  /* Il pulsante del browser: la traccia finisce, il registratore si ferma
   * da solo o lo fermiamo noi, e chi ha avviato la registrazione viene
   * avvisato dopo, quando il video è già in via di chiusura. */
  track.onended = () => {
    if (settled) return
    interrupted = true
    void stop()
    onInterrupted()
  }

  recorder.start(RECORDING_TIMESLICE_MS)

  return {
    stop,
    cancel: () => {
      track.onended = null
      recorder.ondataavailable = null
      recorder.onstop = null
      if (recorder.state !== 'inactive') recorder.stop()
      settle(null)
    },
  }
}
