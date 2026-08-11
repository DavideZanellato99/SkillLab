import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({
  fetchAdminAvatars: vi.fn(),
  createAvatar: vi.fn(),
  updateAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
  restoreAvatar: vi.fn(),
  uploadAvatarImage: vi.fn(),
  fetchVoices: vi.fn(),
}))
vi.mock('../../src/services/admin', () => servizio)

import { queryKeys } from '../../src/hooks/queryKeys'
import {
  useAdminAvatars,
  useCreateAvatar,
  useDeleteAvatar,
  useRestoreAvatar,
  useUpdateAvatar,
  useUploadAvatarImage,
  useVoices,
} from '../../src/hooks/useAdminAvatars'

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  for (const fn of Object.values(servizio)) {
    fn.mockReset()
    fn.mockResolvedValue([])
  }
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
})

describe('useAdminAvatars', () => {
  it('legge il catalogo senza gli archiviati', async () => {
    const { result } = renderHook(() => useAdminAvatars(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchAdminAvatars).toHaveBeenCalledWith(false)
  })

  /* Con e senza gli archiviati sono due risposte diverse dello stesso
   * endpoint: una chiave sola le farebbe sovrascrivere a vicenda, e
   * spuntare la casella mostrerebbe la lista di prima. */
  it('tiene le due liste in voci di cache diverse', async () => {
    servizio.fetchAdminAvatars.mockResolvedValueOnce([{ id: 'a-1' }])
    const senza = renderHook(() => useAdminAvatars(false), { wrapper })
    await waitFor(() => expect(senza.result.current.isSuccess).toBe(true))

    servizio.fetchAdminAvatars.mockResolvedValueOnce([{ id: 'a-1' }, { id: 'a-2' }])
    const con = renderHook(() => useAdminAvatars(true), { wrapper })
    await waitFor(() => expect(con.result.current.isSuccess).toBe(true))

    expect(senza.result.current.data).toHaveLength(1)
    expect(con.result.current.data).toHaveLength(2)
    expect(servizio.fetchAdminAvatars).toHaveBeenCalledWith(true)
  })

  it('non legge il catalogo a chi non lo gestisce', () => {
    renderHook(() => useAdminAvatars(false, false), { wrapper })
    expect(servizio.fetchAdminAvatars).not.toHaveBeenCalled()
  })
})

describe('useVoices', () => {
  it('legge il catalogo delle voci', async () => {
    const { result } = renderHook(() => useVoices(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.getQueryData(queryKeys.voices)).toEqual([])
  })

  it('non lo legge dove non serve', () => {
    renderHook(() => useVoices(false), { wrapper })
    expect(servizio.fetchVoices).not.toHaveBeenCalled()
  })
})

/* Ogni scrittura su un avatar invalida tutto il ramo, che comprende il
 * catalogo admin e la galleria degli studenti: un avatar creato o
 * archiviato cambia anche quello che vedono loro. */
describe('scritture su un avatar', () => {
  const casi: [string, () => { mutate: (v: never) => void }, unknown, ReturnType<typeof vi.fn>][] =
    [
      ['creazione', () => useCreateAvatar(), { name: 'Cliente' }, servizio.createAvatar],
      [
        'modifica',
        () => useUpdateAvatar(),
        { avatarId: 'a-1', payload: { name: 'Cliente' } },
        servizio.updateAvatar,
      ],
      ['archiviazione', () => useDeleteAvatar(), 'a-1', servizio.deleteAvatar],
      ['ripristino', () => useRestoreAvatar(), 'a-1', servizio.restoreAvatar],
    ]

  it.each(casi)('la %s rilegge catalogo e galleria', async (_nome, hook, variabili, chiamata) => {
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(hook, { wrapper })

    result.current.mutate(variabili as never)

    await waitFor(() => expect(chiamata).toHaveBeenCalled())
    await waitFor(() => expect(invalida).toHaveBeenCalledWith({ queryKey: queryKeys.avatars.all }))
  })

  it('passa id e scheda separati alla modifica', async () => {
    const { result } = renderHook(() => useUpdateAvatar(), { wrapper })
    const payload = { name: 'Cliente', image_url: '/x.png', organization_id: 'org-1', profile: {} }

    result.current.mutate({ avatarId: 'a-1', payload } as never)

    await waitFor(() => expect(servizio.updateAvatar).toHaveBeenCalledWith('a-1', payload))
  })

  /* Il caricamento dell'immagine non tocca nessun avatar salvato: risponde
   * con l'URL che il form mette nel campo, quindi non c'è niente da
   * rileggere. */
  it('il caricamento del ritratto non rilegge niente', async () => {
    servizio.uploadAvatarImage.mockResolvedValue({ image_url: '/static/avatars/a-1.png' })
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useUploadAvatarImage(), { wrapper })

    result.current.mutate(new File(['x'], 'ritratto.png'))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ image_url: '/static/avatars/a-1.png' })
    expect(invalida).not.toHaveBeenCalled()
  })
})
