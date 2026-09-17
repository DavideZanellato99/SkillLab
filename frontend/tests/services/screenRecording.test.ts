import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ScreenShareError, startScreenRecording } from '../../src/services/screenRecording'

/* Il pezzo fra il clic su "inizia" e il file da caricare: cosa si chiede al
 * browser, cosa si rifiuta di quello che risponde, e come si chiude il video
 * quando è l'utente a fermare la condivisione dal pulsante del browser. */

class FakeTrack {
  onended: (() => void) | null = null
  stopped = false
  private readonly surface: string | undefined
  constructor(surface: string | undefined) {
    this.surface = surface
  }
  getSettings() {
    return this.surface === undefined ? {} : { displaySurface: this.surface }
  }
  stop() {
    this.stopped = true
  }
}

class FakeStream {
  readonly track: FakeTrack
  constructor(track: FakeTrack) {
    this.track = track
  }
  getVideoTracks() {
    return [this.track]
  }
  getTracks() {
    return [this.track]
  }
}

/* Un MediaRecorder che produce un pezzo per ogni start e chiude al primo
 * stop. Le istanze si raccolgono per leggerne le opzioni. */
const recorders: FakeRecorder[] = []
class FakeRecorder {
  static isTypeSupported = (type: string) => type === 'video/webm;codecs=vp9'
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  readonly stream: FakeStream
  readonly options: { mimeType: string; videoBitsPerSecond: number }
  constructor(stream: FakeStream, options: { mimeType: string; videoBitsPerSecond: number }) {
    this.stream = stream
    this.options = options
    recorders.push(this)
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['frame'], { type: this.options.mimeType }) })
    this.onstop?.()
  }
}

let getDisplayMedia: ReturnType<typeof vi.fn>

function shareScreen(surface: string | undefined = 'monitor') {
  const stream = new FakeStream(new FakeTrack(surface))
  getDisplayMedia.mockResolvedValue(stream)
  return stream
}

describe('startScreenRecording', () => {
  beforeEach(() => {
    recorders.length = 0
    getDisplayMedia = vi.fn()
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('chiede lo schermo intero, senza audio, a pochi fotogrammi al secondo', async () => {
    shareScreen()

    await startScreenRecording(() => {})

    const [constraints] = getDisplayMedia.mock.calls[0]
    expect(constraints.audio).toBe(false)
    expect(constraints.video.displaySurface).toBe('monitor')
    expect(constraints.video.frameRate.max).toBeLessThanOrEqual(10)
    expect(constraints.surfaceSwitching).toBe('exclude')
  })

  it('registra con il contenitore che il browser supporta e il bitrate basso', async () => {
    shareScreen()

    await startScreenRecording(() => {})

    expect(recorders).toHaveLength(1)
    expect(recorders[0].options.mimeType).toBe('video/webm;codecs=vp9')
    expect(recorders[0].options.videoBitsPerSecond).toBeLessThanOrEqual(600_000)
    expect(recorders[0].state).toBe('recording')
  })

  it('restituisce il video alla chiusura, con la durata e senza interruzione', async () => {
    const stream = shareScreen()
    const recorder = await startScreenRecording(() => {})

    const recording = await recorder.stop()

    expect(recording).not.toBeNull()
    expect(recording?.mimeType).toBe('video/webm;codecs=vp9')
    expect(recording?.blob.size).toBeGreaterThan(0)
    expect(recording?.interrupted).toBe(false)
    expect(typeof recording?.durationMs).toBe('number')
    // La condivisione si spegne: il browser toglie la sua barra
    expect(stream.track.stopped).toBe(true)
  })

  it('fermare due volte dà lo stesso video', async () => {
    shareScreen()
    const recorder = await startScreenRecording(() => {})

    const [prima, seconda] = await Promise.all([recorder.stop(), recorder.stop()])

    expect(prima).toBe(seconda)
  })

  /* Il pulsante "interrompi condivisione" del browser: la traccia finisce,
     chi ha avviato viene avvisato, e il video che ne esce lo dice. */
  it("avvisa quando l'utente ferma la condivisione, e il video risulta interrotto", async () => {
    const stream = shareScreen()
    const onInterrupted = vi.fn()
    const recorder = await startScreenRecording(onInterrupted)

    stream.track.onended?.()

    expect(onInterrupted).toHaveBeenCalledTimes(1)
    const recording = await recorder.stop()
    expect(recording?.interrupted).toBe(true)
  })

  it('annullare butta via tutto senza avvisare nessuno', async () => {
    const stream = shareScreen()
    const onInterrupted = vi.fn()
    const recorder = await startScreenRecording(onInterrupted)

    recorder.cancel()

    expect(stream.track.stopped).toBe(true)
    expect(onInterrupted).not.toHaveBeenCalled()
    expect(await recorder.stop()).toBeNull()
  })

  // ── Quello che si rifiuta ──

  it('rifiuta una finestra o una scheda al posto dello schermo', async () => {
    const stream = shareScreen('window')

    await expect(startScreenRecording(() => {})).rejects.toMatchObject({ kind: 'not_monitor' })
    // La traccia si chiude subito: niente resta in condivisione per sbaglio
    expect(stream.track.stopped).toBe(true)
    expect(recorders).toHaveLength(0)
  })

  /* Firefox e Safari non dicono cosa è stato scelto: si prende quello che
     arriva, perché rifiutare tutti i loro utenti sarebbe peggio. */
  it('accetta quando il browser non dice cosa è stato condiviso', async () => {
    shareScreen(undefined)

    await expect(startScreenRecording(() => {})).resolves.toBeDefined()
  })

  it("distingue il rifiuto dell'utente da un browser che non sa farlo", async () => {
    getDisplayMedia.mockRejectedValue(new DOMException('no', 'NotAllowedError'))
    await expect(startScreenRecording(() => {})).rejects.toMatchObject({ kind: 'refused' })

    getDisplayMedia.mockRejectedValue(new DOMException('no', 'NotSupportedError'))
    await expect(startScreenRecording(() => {})).rejects.toMatchObject({ kind: 'unsupported' })
  })

  it('senza getDisplayMedia il browser non è supportato', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {} })

    await expect(startScreenRecording(() => {})).rejects.toBeInstanceOf(ScreenShareError)
    await expect(startScreenRecording(() => {})).rejects.toMatchObject({ kind: 'unsupported' })
  })

  it('ogni rifiuto porta una frase leggibile', () => {
    for (const kind of ['unsupported', 'refused', 'not_monitor'] as const) {
      expect(new ScreenShareError(kind).message.length).toBeGreaterThan(20)
    }
  })
})
