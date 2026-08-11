import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatMessage } from '../../src/services/api'
import { useCitationNavigation } from '../../src/hooks/useCitationNavigation'

/* Le pastiglie "Messaggio n" della pagella devono portare alla riga di
 * trascrizione di cui parlano. Due cose vanno bene o non funziona niente:
 * ritrovare il messaggio giusto anche quando l'id non combacia, e tenere una
 * sola evidenziazione accesa alla volta. */

const messaggi: ChatMessage[] = [
  { id: 'm-1', role: 'user', content: 'Buongiorno', created_at: '2026-03-01T10:00:00Z' },
  { id: 'm-2', role: 'assistant', content: 'Mi dica', created_at: '2026-03-01T10:00:05Z' },
  { id: 'm-3', role: 'user', content: 'Ho un problema', created_at: '2026-03-01T10:00:10Z' },
]

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('resolveCitation', () => {
  it('trova il messaggio dal suo id', () => {
    const { result } = renderHook(() => useCitationNavigation(messaggi))

    expect(result.current.resolveCitation({ index: 1, message_id: 'm-3' })).toBe(messaggi[2])
  })

  /* Le bolle di una chiamata appena chiusa possono avere ancora id locali,
   * che nella valutazione non compaiono: la posizione nella trascrizione è
   * l'àncora di riserva, e senza di lei la pastiglia non porterebbe da
   * nessuna parte proprio sulla conversazione appena finita. */
  it("ripiega sulla posizione quando l'id non combacia", () => {
    const { result } = renderHook(() => useCitationNavigation(messaggi))

    expect(result.current.resolveCitation({ index: 2, message_id: 'sconosciuto' })).toBe(
      messaggi[1],
    )
  })

  it('conta le posizioni a partire da 1', () => {
    const { result } = renderHook(() => useCitationNavigation(messaggi))

    expect(result.current.resolveCitation({ index: 1, message_id: null })).toBe(messaggi[0])
  })

  it('non trova niente per una citazione fuori dalla trascrizione', () => {
    const { result } = renderHook(() => useCitationNavigation(messaggi))

    expect(result.current.resolveCitation({ index: 99, message_id: null })).toBeNull()
  })
})

describe('flashMessage', () => {
  it('porta in vista la bolla registrata e la evidenzia', () => {
    const { result } = renderHook(() => useCitationNavigation(messaggi))
    const nodo = document.createElement('div')
    nodo.scrollIntoView = vi.fn()

    act(() => result.current.registerMessageNode('m-2', nodo))
    act(() => result.current.flashMessage(messaggi[1]))

    expect(nodo.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(result.current.highlightedMessageId).toBe('m-2')
  })

  it('smette di evidenziare da sola dopo qualche secondo', () => {
    const { result } = renderHook(() => useCitationNavigation(messaggi))

    act(() => result.current.flashMessage(messaggi[0]))
    expect(result.current.highlightedMessageId).toBe('m-1')

    act(() => vi.advanceTimersByTime(2500))
    expect(result.current.highlightedMessageId).toBeNull()
  })

  /* Il timer è uno solo: due citazioni cliccate di seguito non devono
   * spegnersi a vicenda, cioè la seconda non deve restare accesa mezzo
   * secondo perché a scadere è il timer della prima. */
  it('non lascia che il timer della prima citazione spenga la seconda', () => {
    const { result } = renderHook(() => useCitationNavigation(messaggi))

    act(() => result.current.flashMessage(messaggi[0]))
    act(() => vi.advanceTimersByTime(2000))
    act(() => result.current.flashMessage(messaggi[2]))

    // Qui sarebbe scaduto il timer della prima citazione
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.highlightedMessageId).toBe('m-3')

    act(() => vi.advanceTimersByTime(1500))
    expect(result.current.highlightedMessageId).toBeNull()
  })

  it('sopporta una citazione su una bolla non più montata', () => {
    const { result } = renderHook(() => useCitationNavigation(messaggi))
    const nodo = document.createElement('div')
    nodo.scrollIntoView = vi.fn()

    act(() => result.current.registerMessageNode('m-1', nodo))
    act(() => result.current.registerMessageNode('m-1', null))

    expect(() => act(() => result.current.flashMessage(messaggi[0]))).not.toThrow()
    expect(nodo.scrollIntoView).not.toHaveBeenCalled()
    expect(result.current.highlightedMessageId).toBe('m-1')
  })

  /* Smontare la pagella mentre un'evidenziazione è accesa lascerebbe un
   * timer che scrive su un componente che non c'è più. */
  it('spegne il timer quando la pagella si chiude', () => {
    const { result, unmount } = renderHook(() => useCitationNavigation(messaggi))

    act(() => result.current.flashMessage(messaggi[0]))
    unmount()

    expect(() => vi.advanceTimersByTime(3000)).not.toThrow()
  })
})
