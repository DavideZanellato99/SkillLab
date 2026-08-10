import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getUnmetPasswordRules, refreshSession } from './auth'

function okResponse(): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => ({}) } as Response
}

function unauthorizedResponse(): Response {
  return {
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    json: async () => ({ detail: 'Sessione scaduta.' }),
  } as Response
}

/* Il rinnovo della sessione è uno solo per tutta l'applicazione, e questi
 * test descrivono il perché: l'access token scade mentre la pagina ha già
 * diverse richieste in volo, quindi i 401 tornano tutti insieme. Un rinnovo
 * per ciascuno vorrebbe dire altrettante chiamate a Cognito nello stesso
 * istante, che Cognito limita, e la prima rifiutata butta fuori qualcuno che
 * aveva una sessione valida. */
describe('refreshSession', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accorpa i rinnovi chiesti insieme in una chiamata sola', async () => {
    let concludi: (response: Response) => void = () => {}
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        concludi = resolve
      }),
    )

    const attese = [refreshSession(), refreshSession(), refreshSession()]
    concludi(okResponse())

    expect(await Promise.all(attese)).toEqual([true, true, true])
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('condivide anche il rinnovo fallito, senza ritentare per ognuno', async () => {
    let concludi: (response: Response) => void = () => {}
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        concludi = resolve
      }),
    )

    const attese = [refreshSession(), refreshSession()]
    concludi(unauthorizedResponse())

    expect(await Promise.all(attese)).toEqual([false, false])
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('il rinnovo successivo riparte davvero', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse())

    await refreshSession()
    await refreshSession()

    // Senza l'azzeramento a fine corsa, la sessione si rinnoverebbe una volta
    // sola e alla scadenza dopo l'utente si ritroverebbe fuori.
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('getUnmetPasswordRules', () => {
  it('non trova niente da ridire su una password conforme', () => {
    expect(getUnmetPasswordRules('Password-Lunga1!')).toEqual([])
  })

  it('elenca le regole non rispettate', () => {
    const mancanti = getUnmetPasswordRules('breve')
    expect(mancanti).toContain('Almeno 12 caratteri')
    expect(mancanti).toContain('Una lettera maiuscola')
    expect(mancanti).toContain('Un numero')
    expect(mancanti).toContain('Un simbolo (es. !@#$%)')
  })
})
