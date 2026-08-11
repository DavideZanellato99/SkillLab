import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
const apiFetchBlob = vi.fn()
vi.mock('../../src/services/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  apiFetchBlob: (...args: unknown[]) => apiFetchBlob(...args),
}))

import { changeMyPassword, fetchMyDataExport, updateMyProfile } from '../../src/services/profile'

function ultimaChiamata(mock: typeof apiFetch) {
  const [endpoint, options] = mock.mock.calls.at(-1) as [string, Record<string, unknown>?]
  return { endpoint, options: options ?? {} }
}

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue({})
  apiFetchBlob.mockReset()
  apiFetchBlob.mockResolvedValue(new Blob())
})

describe('updateMyProfile', () => {
  /* Lo stesso indirizzo che serve il profilo corrente, in PUT: qui non
   * passa un id utente, l'utente lo prende il server dalla sessione. Un
   * indirizzo con id trasformerebbe una modifica del proprio profilo in
   * un'operazione da amministratore. */
  it('modifica il proprio profilo senza passare nessun id', async () => {
    await updateMyProfile({ nome: 'Anna', cognome: 'Rossi' })
    expect(ultimaChiamata(apiFetch)).toEqual({
      endpoint: '/api/auth/me',
      options: { method: 'PUT', body: { nome: 'Anna', cognome: 'Rossi' } },
    })
  })

  it('manda solo i campi toccati', async () => {
    await updateMyProfile({ nome: 'Anna' })
    expect(ultimaChiamata(apiFetch).options.body).toEqual({ nome: 'Anna' })
  })
})

describe('changeMyPassword', () => {
  it('manda la password attuale insieme alla nuova', async () => {
    await changeMyPassword({ current_password: 'Vecchia-1!', new_password: 'Nuova-Lunga1!' })
    expect(ultimaChiamata(apiFetch)).toEqual({
      endpoint: '/api/auth/change-password',
      options: {
        method: 'POST',
        body: { current_password: 'Vecchia-1!', new_password: 'Nuova-Lunga1!' },
      },
    })
  })
})

describe('fetchMyDataExport', () => {
  /* La copia dei propri dati è uno ZIP con dentro gli audio: passa da
   * apiFetchBlob, perché letta come JSON arriverebbe corrotta. */
  it('scarica la copia dei propri dati come file binario', async () => {
    await fetchMyDataExport()
    expect(apiFetch).not.toHaveBeenCalled()
    expect(ultimaChiamata(apiFetchBlob).endpoint).toBe('/api/auth/me/export')
  })
})
