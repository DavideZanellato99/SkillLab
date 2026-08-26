import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useCloseGuard } from '../../src/hooks/useCloseGuard'

/* La promessa è una sola: dove c'è lavoro non salvato, nessuno dei gesti di
 * chiusura lo porta via senza aver chiesto. */

describe('useCloseGuard', () => {
  it('chiude subito quando non c’è niente da perdere', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useCloseGuard(false, onClose))

    act(() => result.current.requestClose())

    expect(onClose).toHaveBeenCalled()
    expect(result.current.isAsking).toBe(false)
  })

  it('chiede prima di chiudere quando c’è del lavoro non salvato', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useCloseGuard(true, onClose))

    act(() => result.current.requestClose())

    expect(onClose).not.toHaveBeenCalled()
    expect(result.current.isAsking).toBe(true)
  })

  it('torna a quello che si stava scrivendo', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useCloseGuard(true, onClose))

    act(() => result.current.requestClose())
    act(() => result.current.keepEditing())

    expect(onClose).not.toHaveBeenCalled()
    expect(result.current.isAsking).toBe(false)
  })

  it('chiude comunque quando lo si conferma', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useCloseGuard(true, onClose))

    act(() => result.current.requestClose())
    act(() => result.current.discard())

    expect(onClose).toHaveBeenCalled()
    expect(result.current.isAsking).toBe(false)
  })

  /* Chi salva e poi chiude non deve rispondere a una domanda che non ha più
     senso: la conferma dipende da come stanno le cose adesso. */
  it('smette di chiedere quando il lavoro è stato salvato', () => {
    const onClose = vi.fn()
    const { result, rerender } = renderHook(
      ({ unsaved }: { unsaved: boolean }) => useCloseGuard(unsaved, onClose),
      { initialProps: { unsaved: true } },
    )

    rerender({ unsaved: false })
    act(() => result.current.requestClose())

    expect(onClose).toHaveBeenCalled()
    expect(result.current.isAsking).toBe(false)
  })
})
