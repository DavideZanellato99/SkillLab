/* Il simulatore tecnico, lato dati.
 *
 * Due famiglie di hook che stanno insieme perché guardano le stesse righe:
 * quelli di chi svolge il test e quelli di chi lo crea. Una scrittura di
 * amministrazione tocca sempre le due liste, perché pubblicare o ritirare una
 * simulazione cambia anche l'elenco di chi la deve svolgere, e quale delle due
 * sia in cache in quel momento non lo sa nessuno: quello che non si rilegge è
 * il dettaglio, che la risposta della scrittura porta già con sé (vedi
 * `useApplyDetail`). */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Simulation,
  SimulationAdminDetail,
  SimulationAnswerPayload,
  SimulationQuestionPayload,
} from '../services/simulations'
import {
  createSimulation,
  deleteSimulation,
  deleteSimulationAttempt,
  fetchAdminSimulation,
  fetchAdminSimulations,
  fetchAttempt,
  fetchMyAttempts,
  fetchSimulation,
  fetchSimulationResults,
  fetchSimulations,
  generateSimulationQuestions,
  replaceSimulationDocument,
  reviewSimulationPool,
  saveSimulationQuestions,
  startSimulation,
  submitSimulation,
  updateSimulation,
  updateSimulationStatus,
} from '../services/simulations'
import { queryKeys } from './queryKeys'

// --- Chi svolge il test ---

export function useSimulations() {
  return useQuery({
    queryKey: queryKeys.simulations.list,
    queryFn: fetchSimulations,
  })
}

/**
 * Il test prima di cominciarlo: il titolo, il tipo, quante domande sono.
 *
 * Ci si arriva quasi sempre dall'elenco, che ha già in cache esattamente
 * questa riga: il dettaglio è lo stesso schema della lista, senza un campo
 * in più. Quindi si parte da quella invece che da una schermata di
 * caricamento, e le regole del test compaiono nell'istante in cui si preme
 * la scheda.
 *
 * Non è una copia che resta lì: `initialDataUpdatedAt` porta con sé anche
 * *quando* la lista era stata letta, quindi il dettaglio nasce vecchio
 * quanto lei e si ricontrolla da solo appena scade, invece di fidarsi per
 * un minuto di dati che sullo schermo erano già da dieci. Chi apre
 * l'indirizzo di un test direttamente non trova niente in cache, e la
 * chiamata parte come prima.
 */
export function useSimulation(simulationId: string | undefined) {
  const queryClient = useQueryClient()
  const fromList = () =>
    queryClient
      .getQueryData<Simulation[]>(queryKeys.simulations.list)
      ?.find((simulation) => simulation.id === simulationId)

  return useQuery({
    queryKey: queryKeys.simulations.detail(simulationId!),
    queryFn: () => fetchSimulation(simulationId!),
    enabled: Boolean(simulationId),
    initialData: fromList,
    initialDataUpdatedAt: () =>
      fromList() ? queryClient.getQueryState(queryKeys.simulations.list)?.dataUpdatedAt : undefined,
  })
}

/**
 * Comincia il test e riceve le domande estratte per questo tentativo.
 *
 * È una mutation e non una query, e non è un dettaglio tecnico: le domande
 * non sono un dato da tenere in cache e da riprendere quando la finestra
 * torna in primo piano, sono l'esito di un'estrazione fatta una volta. Una
 * query le rifarebbe estrarre a metà test, cambiando le domande sotto le
 * mani di chi sta rispondendo.
 */
export function useStartSimulation(simulationId: string) {
  return useMutation({
    mutationFn: () => startSimulation(simulationId),
  })
}

export function useMyAttempts(simulationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.simulations.attempts(simulationId!),
    queryFn: () => fetchMyAttempts(simulationId!),
    enabled: Boolean(simulationId),
  })
}

export function useAttempt(attemptId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.simulations.attempt(attemptId!),
    queryFn: () => fetchAttempt(attemptId!),
    enabled: Boolean(attemptId),
  })
}

/** Tutti i tentativi su una simulazione, per gli admin del tenant. */
export function useSimulationResults(simulationId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.simulations.results(simulationId!),
    queryFn: () => fetchSimulationResults(simulationId!),
    enabled: Boolean(simulationId) && enabled,
  })
}

/* Consegnare un test aggiunge un tentativo, quindi cambia sia l'elenco dei
 * propri tentativi sia la riga della simulazione, che mostra come è andato
 * l'ultimo. */
export function useSubmitSimulation(simulationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (answers: SimulationAnswerPayload[]) => submitSimulation(simulationId, answers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.simulations.all })
    },
  })
}

// --- Gestione (super admin) ---

export function useAdminSimulations(enabled = true) {
  return useQuery({
    queryKey: queryKeys.simulations.adminList,
    queryFn: fetchAdminSimulations,
    enabled,
  })
}

/**
 * Il dettaglio di gestione: le domande con le chiavi, il controllo e i
 * risultati.
 *
 * Non si ricontrolla al ritorno sulla finestra, al contrario di tutto il
 * resto dell'app. È il dato su cui si sta scrivendo: chi rivede cinquanta
 * domande passa al documento aperto in un'altra finestra e torna qui, e una
 * lettura in sottofondo in quel momento non avrebbe niente da aggiungere,
 * perché ogni scrittura lascia in cache il dettaglio che ha appena ricevuto
 * (vedi `useApplyDetail`). Alla riapertura del pannello si rilegge come
 * qualsiasi altra query, quando è passato il tempo di scadenza.
 */
export function useAdminSimulation(simulationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.simulations.adminDetail(simulationId!),
    queryFn: () => fetchAdminSimulation(simulationId!),
    enabled: Boolean(simulationId),
    refetchOnWindowFocus: false,
  })
}

/**
 * Cosa lascia in cache una scrittura di amministrazione.
 *
 * Ognuna di queste chiamate torna il dettaglio intero e già aggiornato,
 * quindi **il dettaglio si scrive invece di richiederlo**: rileggerlo
 * significherebbe un secondo giro sul server per avere quello che si ha già
 * in mano, e cinquanta domande non sono un giro leggero. È anche quello che
 * tiene ferma la copia locale del pannello, che si riallinea solo quando le
 * domande cambiano davvero.
 *
 * Gli elenchi invece si rileggono, perché quello che cambia lì non sta in
 * questa risposta: la riga di gestione porta il conteggio delle domande e lo
 * stato, e l'elenco di chi i test li svolge si popola o si svuota quando una
 * simulazione viene pubblicata o ritirata.
 */
function useApplyDetail() {
  const queryClient = useQueryClient()
  return (detail: SimulationAdminDetail) => {
    queryClient.setQueryData(queryKeys.simulations.adminDetail(detail.id), detail)
    queryClient.invalidateQueries({ queryKey: queryKeys.simulations.adminList })
    queryClient.invalidateQueries({ queryKey: queryKeys.simulations.list })
    queryClient.invalidateQueries({ queryKey: queryKeys.simulations.detail(detail.id) })
  }
}

export function useCreateSimulation() {
  const applyDetail = useApplyDetail()
  return useMutation({
    mutationFn: createSimulation,
    /* La simulazione appena creata si apre subito sul pannello di revisione:
     * il dettaglio in cache è quello che la creazione ha già restituito, e
     * quel pannello si apre senza una schermata di caricamento. */
    onSuccess: applyDetail,
  })
}

export function useReplaceSimulationDocument(simulationId: string) {
  const applyDetail = useApplyDetail()
  return useMutation({
    mutationFn: (file: File) => replaceSimulationDocument(simulationId, file),
    onSuccess: applyDetail,
  })
}

/**
 * La generazione delle domande.
 *
 * È l'unica chiamata dell'app che può prendersi minuti: sono due passate su
 * un modello di ragionamento con il recupero semantico in mezzo. Non ha
 * ritentativi automatici, perché ripartire da capo da solo raddoppierebbe
 * l'attesa proprio quando è già lunga.
 */
export function useGenerateQuestions(simulationId: string) {
  const applyDetail = useApplyDetail()
  return useMutation({
    mutationFn: () => generateSimulationQuestions(simulationId),
    retry: false,
    onSuccess: applyDetail,
  })
}

/**
 * Il controllo del serbatoio.
 *
 * Lento come la generazione e senza ritentativi automatici, per la stessa
 * ragione: indicizza le cinquanta domande e ne fa rileggere una parte al
 * modello, e ripartire da capo da solo raddoppierebbe un'attesa già lunga.
 */
export function useReviewPool(simulationId: string) {
  const applyDetail = useApplyDetail()
  return useMutation({
    mutationFn: () => reviewSimulationPool(simulationId),
    retry: false,
    onSuccess: applyDetail,
  })
}

export function useUpdateSimulation(simulationId: string) {
  const applyDetail = useApplyDetail()
  return useMutation({
    mutationFn: (payload: { title: string; description: string }) =>
      updateSimulation(simulationId, payload),
    onSuccess: applyDetail,
  })
}

export function useSaveQuestions(simulationId: string) {
  const applyDetail = useApplyDetail()
  return useMutation({
    mutationFn: (questions: SimulationQuestionPayload[]) =>
      saveSimulationQuestions(simulationId, questions),
    onSuccess: applyDetail,
  })
}

export function useUpdateSimulationStatus(simulationId: string) {
  const applyDetail = useApplyDetail()
  return useMutation({
    mutationFn: (status: 'draft' | 'published') => updateSimulationStatus(simulationId, status),
    onSuccess: applyDetail,
  })
}

export function useDeleteSimulation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (simulationId: string) => deleteSimulation(simulationId),
    onSuccess: (_result, simulationId) => {
      /* Qui il dettaglio non si aggiorna, si butta: tenerlo vorrebbe dire
       * che riaprendo quella riga, per un istante, ricomparirebbe un test
       * che non esiste più. Il resto del ramo si rilegge, perché una
       * simulazione eliminata porta via anche i tentativi che la citavano. */
      queryClient.removeQueries({ queryKey: queryKeys.simulations.adminDetail(simulationId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.simulations.all })
    },
  })
}

/** Elimina un test consegnato, dal report attività. La simulazione resta:
 *  sparisce la fotografia di quelle risposte, non il test.
 *
 *  Insieme agli elenchi si invalidano i report, che contano i tentativi e ne
 *  fanno le medie. */
export function useDeleteSimulationAttempt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (attemptId: string) => deleteSimulationAttempt(attemptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.simulations.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.all })
    },
  })
}
