import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mutate = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useConversations', () => ({
  useRenameConversation: () => ({ mutate, isPending: false }),
}))

import { useConversationRename } from '../../src/hooks/useConversationRename'

const conversazione = { id: 'c-1', title: 'Clienti 1' }

/** Il click che apre il campo, con lo stopPropagation che la riga si aspetta. */
function clickSulTitolo() {
  return { stopPropagation: vi.fn() } as unknown as React.MouseEvent
}

beforeEach(() => {
  mutate.mockReset()
})

describe('useConversationRename', () => {
  it('apre il campo sul titolo attuale', () => {
    const { result } = renderHook(() => useConversationRename())

    act(() => result.current.start(conversazione, clickSulTitolo()))

    expect(result.current.renamingId).toBe('c-1')
    expect(result.current.renameValue).toBe('Clienti 1')
  })

  /* Il titolo sta dentro una riga che apre la conversazione: senza fermare
   * l'evento, cominciare a rinominare aprirebbe anche la chat. */
  it('non lascia che il click apra anche la conversazione', () => {
    const { result } = renderHook(() => useConversationRename())
    const evento = clickSulTitolo()

    act(() => result.current.start(conversazione, evento))

    expect(evento.stopPropagation).toHaveBeenCalled()
  })

  it('salva il titolo nuovo e chiude il campo', () => {
    const { result } = renderHook(() => useConversationRename())

    act(() => result.current.start(conversazione, clickSulTitolo()))
    act(() => result.current.setRenameValue('Reclamo difficile'))
    act(() => result.current.commit(conversazione))

    expect(mutate).toHaveBeenCalledWith({ conversationId: 'c-1', title: 'Reclamo difficile' })
    expect(result.current.renamingId).toBeNull()
  })

  it('toglie gli spazi attorno al titolo', () => {
    const { result } = renderHook(() => useConversationRename())

    act(() => result.current.start(conversazione, clickSulTitolo()))
    act(() => result.current.setRenameValue('  Reclamo difficile  '))
    act(() => result.current.commit(conversazione))

    expect(mutate).toHaveBeenCalledWith({ conversationId: 'c-1', title: 'Reclamo difficile' })
  })

  /* Un titolo vuoto viene scartato e resta quello di prima: una
   * conversazione senza nome non si distinguerebbe più dalle altre nella
   * barra laterale. */
  it('scarta un titolo lasciato vuoto', () => {
    const { result } = renderHook(() => useConversationRename())

    act(() => result.current.start(conversazione, clickSulTitolo()))
    act(() => result.current.setRenameValue('   '))
    act(() => result.current.commit(conversazione))

    expect(mutate).not.toHaveBeenCalled()
    expect(result.current.renamingId).toBeNull()
  })

  it('non scrive niente se il titolo non è cambiato', () => {
    const { result } = renderHook(() => useConversationRename())

    act(() => result.current.start(conversazione, clickSulTitolo()))
    act(() => result.current.commit(conversazione))

    expect(mutate).not.toHaveBeenCalled()
  })

  /* Esc smonta il campo, e smontarlo scatena il suo blur, che è la stessa
   * cosa che salva: senza il flag di annullamento, annullare finirebbe per
   * salvare esattamente il testo che si stava buttando via. */
  it('annullando non salva, nemmeno per il blur che arriva dopo', () => {
    const { result } = renderHook(() => useConversationRename())

    act(() => result.current.start(conversazione, clickSulTitolo()))
    act(() => result.current.setRenameValue('Titolo scartato'))
    act(() => result.current.cancel())
    act(() => result.current.commit(conversazione))

    expect(mutate).not.toHaveBeenCalled()
    expect(result.current.renamingId).toBeNull()
  })

  it('dopo un annullamento la rinomina successiva funziona', () => {
    const { result } = renderHook(() => useConversationRename())

    act(() => result.current.start(conversazione, clickSulTitolo()))
    act(() => result.current.cancel())

    act(() => result.current.start(conversazione, clickSulTitolo()))
    act(() => result.current.setRenameValue('Reclamo difficile'))
    act(() => result.current.commit(conversazione))

    expect(mutate).toHaveBeenCalledWith({ conversationId: 'c-1', title: 'Reclamo difficile' })
  })
})
