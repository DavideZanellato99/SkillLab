import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  hasSeenRecordingNotice,
  hasSeenScreenRecordingNotice,
  rememberRecordingNotice,
  rememberScreenRecordingNotice,
} from '../../src/services/recordingNotice'

describe('recordingNotice', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('non risulta visto finché non lo si segna', () => {
    expect(hasSeenRecordingNotice('utente-1')).toBe(false)
    rememberRecordingNotice('utente-1')
    expect(hasSeenRecordingNotice('utente-1')).toBe(true)
  })

  it('vale per un utente alla volta', () => {
    rememberRecordingNotice('utente-1')
    // Postazione condivisa: chi entra dopo riceve comunque il suo avviso
    expect(hasSeenRecordingNotice('utente-2')).toBe(false)
  })

  it('torna a mostrarsi se lo storage non è disponibile', () => {
    // Modalità privata o policy del browser: sbagliamo mostrando l'avviso
    // una volta di troppo, mai una di meno.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage negato')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage negato')
    })

    expect(() => rememberRecordingNotice('utente-1')).not.toThrow()
    expect(hasSeenRecordingNotice('utente-1')).toBe(false)
  })
})

/* Lo schermo registrato in un test è un trattamento diverso dalla voce in
 * una chiamata: chi ha letto un avviso non ha letto l'altro. */
describe('screen recording notice', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('ha la sua memoria, separata da quella della chiamata', () => {
    rememberRecordingNotice('utente-1')
    expect(hasSeenScreenRecordingNotice('utente-1')).toBe(false)

    rememberScreenRecordingNotice('utente-1')
    expect(hasSeenScreenRecordingNotice('utente-1')).toBe(true)
    expect(hasSeenScreenRecordingNotice('utente-2')).toBe(false)
  })
})
