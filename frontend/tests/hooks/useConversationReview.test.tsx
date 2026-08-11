import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({
  saveConversationReview: vi.fn(),
  deleteConversationReview: vi.fn(),
  saveMessageAnnotation: vi.fn(),
  deleteMessageAnnotation: vi.fn(),
}))
vi.mock('../../src/services/admin', () => servizio)

import { queryKeys } from '../../src/hooks/queryKeys'
import {
  useDeleteConversationReview,
  useDeleteMessageAnnotation,
  useSaveConversationReview,
  useSaveMessageAnnotation,
} from '../../src/hooks/useConversationReview'

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  for (const fn of Object.values(servizio)) {
    fn.mockReset()
    fn.mockResolvedValue({})
  }
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
})

/* La revisione cambia il voto finale, quindi fa rileggere il dettaglio e i
 * report, dove quel voto compare. Le notifiche perché una revisione
 * pubblicata è una notifica per chi ha svolto la conversazione. */
describe('revisione', () => {
  it('salvarla rilegge dettaglio, report e notifiche', async () => {
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSaveConversationReview('c-1'), { wrapper })

    result.current.mutate({ summary_note: 'Bene' })

    await waitFor(() =>
      expect(servizio.saveConversationReview).toHaveBeenCalledWith('c-1', { summary_note: 'Bene' }),
    )
    await waitFor(() =>
      expect(invalida).toHaveBeenCalledWith({
        queryKey: queryKeys.conversations.adminDetail('c-1'),
      }),
    )
    expect(invalida).toHaveBeenCalledWith({ queryKey: ['reports'] })
    expect(invalida).toHaveBeenCalledWith({ queryKey: queryKeys.notifications })
  })

  it('ritirarla rilegge le stesse cose', async () => {
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteConversationReview('c-1'), { wrapper })

    result.current.mutate()

    await waitFor(() => expect(servizio.deleteConversationReview).toHaveBeenCalledWith('c-1'))
    await waitFor(() =>
      expect(invalida).toHaveBeenCalledWith({
        queryKey: queryKeys.conversations.adminDetail('c-1'),
      }),
    )
    expect(invalida).toHaveBeenCalledWith({ queryKey: ['reports'] })
  })
})

/* Le note sui messaggi non invalidano niente, e non è una dimenticanza:
 * ricaricare tutta la trascrizione rimbalzerebbe lo scroll a ogni nota, che
 * è il gesto che il docente ripete di più. La cache la aggiorna chi le usa. */
describe('note sui messaggi', () => {
  it('appuntare una nota non ricarica la trascrizione', async () => {
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSaveMessageAnnotation('c-1'), { wrapper })

    result.current.mutate({ messageId: 'm-1', note: 'Qui potevi ascoltare di più' })

    await waitFor(() =>
      expect(servizio.saveMessageAnnotation).toHaveBeenCalledWith(
        'c-1',
        'm-1',
        'Qui potevi ascoltare di più',
      ),
    )
    expect(invalida).not.toHaveBeenCalled()
  })

  /* Toglierla vuole l'id dell'annotazione e non quello del messaggio: è
   * l'unica cosa che la identifica quando la conversazione ne ha diverse. */
  it("toglierla passa l'id della nota, non quello del messaggio", async () => {
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteMessageAnnotation(), { wrapper })

    result.current.mutate('n-1')

    await waitFor(() => expect(servizio.deleteMessageAnnotation).toHaveBeenCalledWith('n-1'))
    expect(invalida).not.toHaveBeenCalled()
  })
})
