import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({
  login: vi.fn(),
  completeNewPassword: vi.fn(),
  logout: vi.fn(),
  isNewPasswordRequired: vi.fn(),
  fetchCurrentUser: vi.fn(),
}))
vi.mock('../../src/services/auth', () => servizio)

import { useAuth } from '../../src/hooks/useAuth'
import { AuthProvider } from '../../src/contexts/AuthProvider'

const utente = {
  id: 'u-1',
  email: 'anna@test.it',
  nome: 'Anna',
  cognome: 'Rossi',
  role: 'user',
}

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

/** Monta il provider e aspetta che il ripristino della sessione sia finito. */
async function montaSessione() {
  const vista = renderHook(() => useAuth(), { wrapper })
  await waitFor(() => expect(vista.result.current.isLoading).toBe(false))
  return vista
}

beforeEach(() => {
  for (const fn of Object.values(servizio)) fn.mockReset()
  servizio.fetchCurrentUser.mockResolvedValue(utente)
  servizio.isNewPasswordRequired.mockReturnValue(false)
  servizio.logout.mockResolvedValue(undefined)
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

/* I cookie di sessione sono HttpOnly, quindi il JavaScript non può leggerli:
 * l'unico modo per sapere se una sessione c'è ancora è chiedere il profilo al
 * server all'avvio. Da qui i due stati di partenza, e il fatto che `isLoading`
 * debba finire in entrambi i casi: restando acceso, l'app resterebbe sulla
 * schermata di caricamento invece di mostrare l'accesso. */
describe('ripristino della sessione', () => {
  it('riprende la sessione dal cookie', async () => {
    const { result } = await montaSessione()

    expect(result.current.user).toEqual(utente)
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('resta senza sessione quando il cookie non vale più', async () => {
    servizio.fetchCurrentUser.mockRejectedValue(new Error('401'))
    const { result } = await montaSessione()

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('parte in caricamento e lo spegne comunque', async () => {
    servizio.fetchCurrentUser.mockRejectedValue(new Error('rete assente'))
    const { result } = renderHook(() => useAuth(), { wrapper })

    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })
})

describe('accesso', () => {
  it('mette in sessione il profilo restituito dal login', async () => {
    servizio.fetchCurrentUser.mockRejectedValue(new Error('401'))
    servizio.login.mockResolvedValue({ user: utente })
    const { result } = await montaSessione()

    await act(async () => {
      await result.current.login('anna@test.it', 'Password-Lunga1!')
    })

    expect(servizio.login).toHaveBeenCalledWith('anna@test.it', 'Password-Lunga1!')
    expect(result.current.user).toEqual(utente)
  })

  /* Il primo accesso con la password temporanea non è un accesso: il server
   * risponde con una sfida e non ha messo nessun cookie. Trattarlo come
   * riuscito farebbe entrare nell'app qualcuno che non ha ancora una
   * sessione, e ogni richiesta successiva prenderebbe 401. */
  it('non apre nessuna sessione quando il server chiede una password nuova', async () => {
    servizio.fetchCurrentUser.mockRejectedValue(new Error('401'))
    servizio.isNewPasswordRequired.mockReturnValue(true)
    servizio.login.mockResolvedValue({ challenge: 'NEW_PASSWORD_REQUIRED', session: 'sess-1' })
    const { result } = await montaSessione()

    let risposta: unknown
    await act(async () => {
      risposta = await result.current.login('anna@test.it', 'Temporanea1!')
    })

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    // La sfida torna a chi ha chiamato: è il modale a chiedere la nuova password
    expect(risposta).toEqual({ challenge: 'NEW_PASSWORD_REQUIRED', session: 'sess-1' })
  })

  it('apre la sessione quando la nuova password viene impostata', async () => {
    servizio.fetchCurrentUser.mockRejectedValue(new Error('401'))
    servizio.completeNewPassword.mockResolvedValue({ user: utente })
    const { result } = await montaSessione()

    await act(async () => {
      await result.current.completeNewPassword('anna@test.it', 'Nuova-Lunga1!', 'sess-1')
    })

    expect(servizio.completeNewPassword).toHaveBeenCalledWith(
      'anna@test.it',
      'Nuova-Lunga1!',
      'sess-1',
    )
    expect(result.current.user).toEqual(utente)
  })

  it("lascia salire l'errore di un accesso rifiutato", async () => {
    servizio.fetchCurrentUser.mockRejectedValue(new Error('401'))
    servizio.login.mockRejectedValue(new Error('Credenziali non valide.'))
    const { result } = await montaSessione()

    await expect(result.current.login('anna@test.it', 'sbagliata')).rejects.toThrow(
      'Credenziali non valide.',
    )
    expect(result.current.user).toBeNull()
  })
})

describe('uscita e profilo', () => {
  /* Lo stato locale si azzera subito senza aspettare la risposta: la
   * revoca dei token è un fatto del server, e tenere l'utente sullo schermo
   * finché quella non torna vorrebbe dire mostrargli ancora l'app dopo che
   * ha chiesto di uscire. */
  it('esce senza aspettare la risposta del server', async () => {
    let revoca: () => void = () => {}
    servizio.logout.mockReturnValue(
      new Promise<void>((resolve) => {
        revoca = resolve
      }),
    )
    const { result } = await montaSessione()

    act(() => result.current.logout())

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(servizio.logout).toHaveBeenCalled()
    revoca()
  })

  /* Il profilo aggiornato arriva intero dal server invece di essere
   * ritoccato campo per campo qui: è il server la fonte, e ricomporlo a mano
   * lascerebbe sullo schermo un profilo che non esiste da nessuna parte. */
  it('sostituisce il profilo in sessione con quello aggiornato', async () => {
    const { result } = await montaSessione()

    act(() => result.current.updateUser({ ...utente, nome: 'Annalisa' } as never))

    expect(result.current.user?.nome).toBe('Annalisa')
    expect(result.current.isAuthenticated).toBe(true)
  })
})

/* La disconnessione per inattività è cablata qui: il provider la accende solo
 * quando una sessione c'è, e le passa l'uscita vera. */
describe('inattività', () => {
  /* Il tempo va finto prima di montare: il controllo periodico nasce
   * insieme alla sessione, e uno acceso con l'orologio vero non lo sposta
   * nessun avanzamento successivo. */
  async function montaConTempoFinto() {
    vi.useFakeTimers()
    const vista = renderHook(() => useAuth(), { wrapper })
    // Lascia risolvere il ripristino della sessione, che è un microtask
    await act(async () => {})
    return vista
  }

  it("esce da sola dopo mezz'ora di inattività", async () => {
    const { result } = await montaConTempoFinto()
    expect(result.current.isAuthenticated).toBe(true)

    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000 + 1000)
    })

    expect(servizio.logout).toHaveBeenCalled()
    expect(result.current.user).toBeNull()
  })

  it("non sorveglia niente quando non c'è nessuna sessione", async () => {
    servizio.fetchCurrentUser.mockRejectedValue(new Error('401'))
    const { result } = await montaConTempoFinto()
    expect(result.current.isAuthenticated).toBe(false)

    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000 + 1000)
    })

    expect(servizio.logout).not.toHaveBeenCalled()
  })
})

describe('useAuth', () => {
  /* Fuori dal provider non c'è nessuna sessione da leggere: restituire un
   * utente nullo farebbe sembrare la pagina semplicemente scollegata, e
   * l'errore vero, cioè un albero montato senza provider, resterebbe
   * nascosto. */
  it('si rifiuta di funzionare fuori dal provider', () => {
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within an AuthProvider')
  })
})
