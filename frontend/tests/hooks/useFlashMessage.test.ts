import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useFlashMessage } from '../../src/hooks/useFlashMessage'

/* Il messaggio di conferma che se ne va da solo. Sembra un dettaglio, ma i
 * due casi qui sotto sono esattamente quelli che il `setTimeout` sparso per
 * le pagine sbagliava: due conferme ravvicinate, e la pagina lasciata prima
 * della scadenza. */

describe('useFlashMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('mostra il messaggio e lo toglie da solo', () => {
    const { result } = renderHook(() => useFlashMessage(1000))

    act(() => result.current.flash('Utente creato'))
    expect(result.current.message).toBe('Utente creato')

    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.message).toBe('')
  })

  it('un secondo messaggio riparte da capo invece di ereditare il tempo del primo', () => {
    const { result } = renderHook(() => useFlashMessage(1000))

    act(() => result.current.flash('Primo'))
    act(() => vi.advanceTimersByTime(900))
    act(() => result.current.flash('Secondo'))

    // Qui il timer del primo sarebbe scaduto e avrebbe spento il secondo
    act(() => vi.advanceTimersByTime(200))
    expect(result.current.message).toBe('Secondo')

    act(() => vi.advanceTimersByTime(800))
    expect(result.current.message).toBe('')
  })

  it('non lascia timer in giro quando la pagina se ne va', () => {
    const { result, unmount } = renderHook(() => useFlashMessage(1000))
    act(() => result.current.flash('Utente creato'))

    unmount()

    // Senza la pulizia, allo scadere si scriverebbe su un componente smontato
    expect(vi.getTimerCount()).toBe(0)
  })
})
