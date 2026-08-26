import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({
  fetchSimulations: vi.fn(),
  fetchSimulation: vi.fn(),
  startSimulation: vi.fn(),
  submitSimulation: vi.fn(),
  fetchMyAttempts: vi.fn(),
  fetchAttempt: vi.fn(),
  fetchSimulationResults: vi.fn(),
  fetchAdminSimulations: vi.fn(),
  fetchAdminSimulation: vi.fn(),
  createSimulation: vi.fn(),
  replaceSimulationDocument: vi.fn(),
  generateSimulationQuestions: vi.fn(),
  updateSimulation: vi.fn(),
  saveSimulationQuestions: vi.fn(),
  updateSimulationStatus: vi.fn(),
  deleteSimulation: vi.fn(),
  deleteSimulationAttempt: vi.fn(),
}))
vi.mock('../../src/services/simulations', () => servizio)

import { queryKeys } from '../../src/hooks/queryKeys'
import {
  useAdminSimulation,
  useAdminSimulations,
  useAttempt,
  useCreateSimulation,
  useDeleteSimulation,
  useDeleteSimulationAttempt,
  useGenerateQuestions,
  useMyAttempts,
  useReplaceSimulationDocument,
  useSaveQuestions,
  useSimulation,
  useSimulationResults,
  useSimulations,
  useStartSimulation,
  useSubmitSimulation,
  useUpdateSimulation,
  useUpdateSimulationStatus,
} from '../../src/hooks/useSimulations'

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

describe('letture di chi svolge il test', () => {
  it("legge l'elenco dei test disponibili", async () => {
    const { result } = renderHook(() => useSimulations(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(servizio.fetchSimulations).toHaveBeenCalled()
  })

  /* Gli id arrivano dalla rotta e al primo giro possono non esserci:
   * chiederli comunque significherebbe una richiesta su /undefined. */
  it('aspetta che un id ci sia', () => {
    renderHook(() => useSimulation(undefined), { wrapper })
    renderHook(() => useMyAttempts(undefined), { wrapper })
    renderHook(() => useAttempt(undefined), { wrapper })
    renderHook(() => useSimulationResults(undefined), { wrapper })
    renderHook(() => useAdminSimulation(undefined), { wrapper })

    expect(servizio.fetchSimulation).not.toHaveBeenCalled()
    expect(servizio.fetchMyAttempts).not.toHaveBeenCalled()
    expect(servizio.fetchAttempt).not.toHaveBeenCalled()
    expect(servizio.fetchSimulationResults).not.toHaveBeenCalled()
    expect(servizio.fetchAdminSimulation).not.toHaveBeenCalled()
  })

  it('legge il singolo test, i propri tentativi e un esito', async () => {
    const test = renderHook(() => useSimulation('s-1'), { wrapper })
    const tentativi = renderHook(() => useMyAttempts('s-1'), { wrapper })
    const esito = renderHook(() => useAttempt('t-1'), { wrapper })

    await waitFor(() => expect(test.result.current.isSuccess).toBe(true))
    await waitFor(() => expect(tentativi.result.current.isSuccess).toBe(true))
    await waitFor(() => expect(esito.result.current.isSuccess).toBe(true))

    expect(servizio.fetchSimulation).toHaveBeenCalledWith('s-1')
    expect(servizio.fetchMyAttempts).toHaveBeenCalledWith('s-1')
    expect(servizio.fetchAttempt).toHaveBeenCalledWith('t-1')
  })

  it('non legge i tentativi di tutti a chi non può vederli', () => {
    renderHook(() => useSimulationResults('s-1', false), { wrapper })
    expect(servizio.fetchSimulationResults).not.toHaveBeenCalled()
  })

  it("non legge l'elenco di gestione a chi non lo gestisce", () => {
    renderHook(() => useAdminSimulations(false), { wrapper })
    expect(servizio.fetchAdminSimulations).not.toHaveBeenCalled()
  })
})

/* Cominciare un test è una mutation e non una lettura: le domande sono
 * l'esito di un'estrazione fatta una volta, e una query le rifarebbe
 * estrarre al ritorno sulla scheda, cambiandole sotto le mani di chi sta
 * rispondendo. */
describe('useStartSimulation', () => {
  it('non chiede niente finché il test non comincia', () => {
    renderHook(() => useStartSimulation('s-1'), { wrapper })
    expect(servizio.startSimulation).not.toHaveBeenCalled()
  })

  it('estrae le domande quando il test comincia', async () => {
    const { result } = renderHook(() => useStartSimulation('s-1'), { wrapper })

    result.current.mutate()

    await waitFor(() => expect(servizio.startSimulation).toHaveBeenCalledWith('s-1'))
  })

  /* Non mette niente in cache: le domande vivono nel componente che le sta
   * mostrando, e una voce di cache le farebbe ricomparire identiche al
   * tentativo dopo. */
  it('non lascia le domande in cache', async () => {
    servizio.startSimulation.mockResolvedValue([{ id: 'q-1' }])
    const { result } = renderHook(() => useStartSimulation('s-1'), { wrapper })

    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.getQueryData(queryKeys.simulations.detail('s-1'))).toBeUndefined()
  })
})

describe('scritture', () => {
  /* Consegnare aggiunge un tentativo, quindi cambia sia i propri tentativi
   * sia la riga del test, che mostra come è andato l'ultimo: si invalida
   * tutto il ramo perché quale delle due sia in cache non lo sa nessuno. */
  it('la consegna rilegge tutto il ramo delle simulazioni', async () => {
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSubmitSimulation('s-1'), { wrapper })

    result.current.mutate([{ question_id: 'q-1', selected_option: 1 }] as never)

    await waitFor(() => expect(servizio.submitSimulation).toHaveBeenCalled())
    await waitFor(() =>
      expect(invalida).toHaveBeenCalledWith({ queryKey: queryKeys.simulations.all }),
    )
  })

  /* Il dettaglio che ogni scrittura di amministrazione restituisce, già
     aggiornato: è quello che finisce in cache al posto di una rilettura. */
  const dettaglio = { id: 's-1', title: 'Test', questions: [] }

  const casi: [string, () => { mutate: (v: never) => void }, unknown, ReturnType<typeof vi.fn>][] =
    [
      ['creazione', () => useCreateSimulation(), { title: 'Test' }, servizio.createSimulation],
      [
        'sostituzione del documento',
        () => useReplaceSimulationDocument('s-1'),
        new File(['x'], 'd.pdf'),
        servizio.replaceSimulationDocument,
      ],
      [
        'generazione delle domande',
        () => useGenerateQuestions('s-1'),
        undefined,
        servizio.generateSimulationQuestions,
      ],
      [
        'modifica',
        () => useUpdateSimulation('s-1'),
        { title: 'Test', description: '' },
        servizio.updateSimulation,
      ],
      [
        'salvataggio delle domande',
        () => useSaveQuestions('s-1'),
        [{ position: 1 }],
        servizio.saveSimulationQuestions,
      ],
      [
        'pubblicazione',
        () => useUpdateSimulationStatus('s-1'),
        'published',
        servizio.updateSimulationStatus,
      ],
    ]

  /* Gli elenchi sì, perché il conteggio delle domande e lo stato stanno lì e
     non nella risposta della scrittura. Il dettaglio no: la risposta lo
     porta già con sé, e su cinquanta domande rileggerlo è un giro sul server
     per avere quello che si ha in mano. */
  it.each(casi)(
    'la %s scrive il dettaglio in cache e rilegge gli elenchi',
    async (_nome, hook, variabili, chiamata) => {
      chiamata.mockResolvedValue(dettaglio)
      const invalida = vi.spyOn(client, 'invalidateQueries')
      const { result } = renderHook(hook, { wrapper })

      result.current.mutate(variabili as never)

      await waitFor(() => expect(chiamata).toHaveBeenCalled())
      await waitFor(() =>
        expect(client.getQueryData(queryKeys.simulations.adminDetail('s-1'))).toEqual(dettaglio),
      )
      expect(invalida).toHaveBeenCalledWith({ queryKey: queryKeys.simulations.adminList })
      expect(invalida).toHaveBeenCalledWith({ queryKey: queryKeys.simulations.list })
      expect(invalida).not.toHaveBeenCalledWith({
        queryKey: queryKeys.simulations.adminDetail('s-1'),
      })
    },
  )

  /* Un test eliminato non ha un dettaglio da aggiornare: quella voce si
     butta, o riaprendo la riga ricomparirebbe per un istante. */
  it("l'eliminazione butta il dettaglio e rilegge tutto il ramo", async () => {
    client.setQueryData(queryKeys.simulations.adminDetail('s-1'), dettaglio)
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteSimulation(), { wrapper })

    result.current.mutate('s-1')

    await waitFor(() => expect(servizio.deleteSimulation).toHaveBeenCalledWith('s-1'))
    await waitFor(() =>
      expect(client.getQueryData(queryKeys.simulations.adminDetail('s-1'))).toBeUndefined(),
    )
    expect(invalida).toHaveBeenCalledWith({ queryKey: queryKeys.simulations.all })
  })

  /* La generazione non ritenta da sola: sono minuti di modello, e ripartire
   * da capo raddoppierebbe l'attesa proprio quando è già lunga. */
  it('la generazione fallita non riparte da sola', async () => {
    servizio.generateSimulationQuestions.mockRejectedValue(new Error('modello non disponibile'))
    const { result } = renderHook(() => useGenerateQuestions('s-1'), { wrapper })

    result.current.mutate()

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(servizio.generateSimulationQuestions).toHaveBeenCalledOnce()
  })

  /* Eliminare un tentativo cancella la fotografia di quelle risposte: i
   * report ne contavano il voto nelle medie, quindi vanno riletti anche
   * loro. */
  it("l'eliminazione di un tentativo rilegge anche i report", async () => {
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeleteSimulationAttempt(), { wrapper })

    result.current.mutate('t-1')

    await waitFor(() => expect(servizio.deleteSimulationAttempt).toHaveBeenCalledWith('t-1'))
    await waitFor(() =>
      expect(invalida).toHaveBeenCalledWith({ queryKey: queryKeys.simulations.all }),
    )
    expect(invalida).toHaveBeenCalledWith({ queryKey: queryKeys.reports.all })
  })
})
