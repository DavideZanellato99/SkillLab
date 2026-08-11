/* Cosa legge l'utente quando una chiamata non parte.
 *
 * Il backend, quando rifiuta, lo dice: linee occupate perché il processo è
 * al suo tetto di chiamate, oppure configurazione della voce mancante. Manda
 * un messaggio e chiude subito dopo.
 *
 * Il rischio è che quel messaggio si perda: la chiusura arriva un istante
 * dopo, e se fosse lei a decidere l'esito, l'utente leggerebbe "connessione
 * chiusa inaspettatamente" al posto di "riprova fra qualche minuto". Il
 * primo suona come un guasto dell'app, il secondo dice cosa fare.
 *
 * Il secondo test guarda l'altro lato della stessa cosa: una chiamata che
 * non è mai partita non è una chiamata finita, quindi non deve far salvare
 * registrazioni né dichiarare conclusa una sessione che non c'è stata.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VoiceCall } from '../../src/services/voiceCall'

class FakeWebSocket {
  static readonly OPEN = 1
  static last: FakeWebSocket

  binaryType = ''
  readyState = FakeWebSocket.OPEN
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  close = vi.fn()
  send = vi.fn()

  url: string
  protocols?: string[]

  constructor(url: string, protocols?: string[]) {
    this.url = url
    this.protocols = protocols
    FakeWebSocket.last = this
  }

  /** Il backend manda un evento JSON. */
  emit(payload: object) {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }
}

const callbacks = () => ({
  onUserFinal: vi.fn(),
  onAssistantEnd: vi.fn(),
  onSpeakingChange: vi.fn(),
  onProcessingChange: vi.fn(),
  onError: vi.fn(),
  onClose: vi.fn(),
})

/** Apre il socket senza microfono, worklet e registratore. */
const apriSocket = (cb: ReturnType<typeof callbacks>) => {
  const call = new VoiceCall('sess-1', cb)
  const promise = (call as unknown as { openSocket: (url: string) => Promise<void> }).openSocket(
    'ws://test/api/voice/ws',
  )
  // La promessa viene rifiutata dai test: senza questo Node segnala un
  // rejection non gestito prima ancora che l'assert la osservi.
  promise.catch(() => undefined)
  return { call, promise, ws: FakeWebSocket.last }
}

beforeEach(() => {
  vi.stubGlobal('WebSocket', FakeWebSocket)
})

describe('VoiceCall, come si apre il socket', () => {
  it("porta l'id di sessione nell'handshake e non nell'indirizzo", () => {
    // L'id è la sola credenziale che apre la chiamata: in un indirizzo
    // finirebbe nel log degli accessi del proxy, nell'handshake no.
    const { ws } = apriSocket(callbacks())

    expect(ws.url).not.toContain('sess-1')
    expect(ws.protocols).toEqual(['skilllab-voice', 'sess-1'])
  })
})

describe('VoiceCall, una chiamata che non parte', () => {
  it('consegna il motivo del rifiuto, non un errore di rete', async () => {
    const cb = callbacks()
    const { promise, ws } = apriSocket(cb)

    ws.emit({
      type: 'error',
      message: 'Tutte le linee sono occupate in questo momento. Riprova fra qualche minuto.',
    })
    ws.onclose?.()

    await expect(promise).rejects.toThrow(/linee sono occupate/)
  })

  it('non tratta un avvio fallito come una telefonata conclusa', async () => {
    const cb = callbacks()
    const { promise, ws } = apriSocket(cb)

    ws.emit({ type: 'error', message: 'Tutte le linee sono occupate.' })
    ws.onclose?.()

    await expect(promise).rejects.toThrow()
    // Nessuna registrazione da salvare, nessuna sessione da chiudere: non
    // c'è stata nessuna chiamata.
    expect(cb.onClose).not.toHaveBeenCalled()
  })

  it('una chiusura senza spiegazioni resta un errore generico', async () => {
    const cb = callbacks()
    const { promise, ws } = apriSocket(cb)

    // È il caso della sessione scaduta o sconosciuta: il backend chiude e
    // basta (4401), senza dire niente.
    ws.onclose?.()

    await expect(promise).rejects.toThrow(/chiusa inaspettatamente/)
  })
})

describe('VoiceCall, una chiamata avviata', () => {
  it('un errore dopo il ready arriva come errore della chiamata in corso', async () => {
    const cb = callbacks()
    const { promise, ws } = apriSocket(cb)

    ws.emit({ type: 'ready' })
    await expect(promise).resolves.toBeUndefined()

    ws.emit({ type: 'error', message: 'Riconoscimento vocale non disponibile.' })

    expect(cb.onError).toHaveBeenCalledWith('Riconoscimento vocale non disponibile.')
  })

  it('la chiusura di una chiamata avviata chiude la sessione', async () => {
    const cb = callbacks()
    const { promise, ws } = apriSocket(cb)

    ws.emit({ type: 'ready' })
    await promise
    ws.onclose?.()

    expect(cb.onClose).toHaveBeenCalled()
  })
})
