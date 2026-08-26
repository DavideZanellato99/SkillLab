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
      ['eliminazione', () => useDeleteSimulation(), 's-1', servizio.deleteSimulation],
    ]

  it.each(casi)('la %s rilegge gli elenchi', async (_nome, hook, variabili, chiamata) => {
    const invalida = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(hook, { wrapper })

    result.current.mutate(variabili as never)

    await waitFor(() => expect(chiamata).toHaveBeenCalled())
    await waitFor(() =>
      expect(invalida).toHaveBeenCalledWith({ queryKey: queryKeys.simulations.all }),
    )
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
