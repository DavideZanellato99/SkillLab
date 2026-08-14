import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.hoisted(() => vi.fn())
const apiFetchBlob = vi.hoisted(() => vi.fn())
vi.mock('../../src/services/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  apiFetchBlob: (...args: unknown[]) => apiFetchBlob(...args),
}))

import {
  POOL_COUNT,
  QUESTION_COUNT,
  createSimulation,
  deleteSimulation,
  deleteSimulationAttempt,
  fetchAdminSimulation,
  fetchAdminSimulations,
  fetchAttempt,
  fetchAttemptPdf,
  fetchMyAttempts,
  fetchSimulation,
  fetchSimulationResults,
  fetchSimulations,
  generateSimulationQuestions,
  replaceSimulationDocument,
  requiredPool,
  saveSimulationQuestions,
  startSimulation,
  submitSimulation,
  updateSimulation,
  updateSimulationStatus,
} from '../../src/services/simulations'

function ultimaChiamata(mock = apiFetch) {
  const [endpoint, options] = mock.mock.calls.at(-1) as [string, Record<string, unknown>?]
  return { endpoint, options: options ?? {} }
}

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue({})
  apiFetchBlob.mockReset()
  apiFetchBlob.mockResolvedValue(new Blob())
})

/* Il serbatoio pieno alla generazione non costa niente, cinquanta domande
 * sono la stessa attesa di dieci; a mano sono cinquanta domande scritte una
 * per una, e il minimo diventa quanto serve a comporre un tentativo. */
describe('requiredPool', () => {
  it('chiede il serbatoio pieno alle domande generate', () => {
    expect(requiredPool('ai')).toBe(POOL_COUNT)
  })

  it('a mano si accontenta di un tentativo intero', () => {
    expect(requiredPool('manual')).toBe(QUESTION_COUNT)
  })
})

describe('svolgimento di un test', () => {
  it("legge l'elenco e il singolo test", async () => {
    await fetchSimulations()
    expect(ultimaChiamata().endpoint).toBe('/api/simulations')

    await fetchSimulation('s-1')
    expect(ultimaChiamata().endpoint).toBe('/api/simulations/s-1')
  })

  /* Cominciare un test è una POST e non una lettura: la stessa chiamata due
   * volte dà due file di domande diverse, estratte a caso dal serbatoio. */
  it('comincia un tentativo con una scrittura', async () => {
    await startSimulation('s-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/simulations/s-1/start',
      options: { method: 'POST' },
    })
  })

  it('consegna tutte le risposte insieme', async () => {
    const risposte = [
      { question_id: 'q-1', selected_option: 2 },
      { question_id: 'q-2', selected_option: null },
    ]
    await submitSimulation('s-1', risposte as never)
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/simulations/s-1/attempts',
      options: { method: 'POST', body: { answers: risposte } },
    })
  })

  it('legge i propri tentativi e il singolo esito', async () => {
    await fetchMyAttempts('s-1')
    expect(ultimaChiamata().endpoint).toBe('/api/simulations/s-1/attempts')

    await fetchAttempt('t-1')
    expect(ultimaChiamata().endpoint).toBe('/api/simulations/attempts/t-1')
  })

  it("scarica l'esito in PDF come file binario", async () => {
    await fetchAttemptPdf('t-1')
    expect(apiFetch).not.toHaveBeenCalled()
    expect(ultimaChiamata(apiFetchBlob).endpoint).toBe('/api/simulations/attempts/t-1/pdf')
  })

  /* I tentativi di tutti stanno su un indirizzo diverso dai propri: la
   * differenza è chi può leggerli, e un solo endpoint non saprebbe dirlo. */
  it('legge i tentativi di tutti da un indirizzo separato', async () => {
    await fetchSimulationResults('s-1')
    expect(ultimaChiamata().endpoint).toBe('/api/simulations/s-1/results')
  })
})

describe('gestione dei test', () => {
  it('legge elenco e dettaglio di gestione, bozze comprese', async () => {
    await fetchAdminSimulations()
    expect(ultimaChiamata().endpoint).toBe('/api/admin/simulations')

    await fetchAdminSimulation('s-1')
    expect(ultimaChiamata().endpoint).toBe('/api/admin/simulations/s-1')
  })

  /* La creazione viaggia come modulo perché porta il documento: apiFetch
   * riconosce il FormData e lascia che sia fetch a scrivere il confine del
   * multipart. */
  it('crea dal documento caricato', async () => {
    const file = new File(['x'], 'normativa.pdf', { type: 'application/pdf' })
    await createSimulation({
      organizationId: 'org-1',
      title: 'Antiriciclaggio',
      description: 'Le verifiche',
      kind: 'multiple',
      source: 'ai',
      file,
    })

    const { endpoint, options } = ultimaChiamata()
    expect(endpoint).toBe('/api/admin/simulations')
    expect(options.method).toBe('POST')
    const form = options.body as FormData
    expect(form.get('organization_id')).toBe('org-1')
    expect(form.get('title')).toBe('Antiriciclaggio')
    expect(form.get('kind')).toBe('multiple')
    expect(form.get('source')).toBe('ai')
    expect(form.get('file')).toBe(file)
  })

  /* Una simulazione scritta a mano non ha un documento da cui generare, e
   * il server rifiuterebbe quella che ne portasse uno. */
  it('crea vuota senza allegare nessun documento', async () => {
    await createSimulation({
      organizationId: 'org-1',
      title: 'Antiriciclaggio',
      description: '',
      kind: 'open',
      source: 'manual',
      file: null,
    })

    expect((ultimaChiamata().options.body as FormData).get('file')).toBeNull()
  })

  /* Senza organizzazione il campo non parte proprio: è il caso dell'org
   * admin, che ne ha una sola, e a metterci la sua è il server. */
  it('crea senza nominare l organizzazione', async () => {
    await createSimulation({
      organizationId: null,
      title: 'Antiriciclaggio',
      description: '',
      kind: 'multiple',
      source: 'manual',
      file: null,
    })

    expect((ultimaChiamata().options.body as FormData).get('organization_id')).toBeNull()
  })

  it('sostituisce il documento', async () => {
    const file = new File(['x'], 'nuova.pdf', { type: 'application/pdf' })
    await replaceSimulationDocument('s-1', file)

    const { endpoint, options } = ultimaChiamata()
    expect(endpoint).toBe('/api/admin/simulations/s-1/document')
    expect((options.body as FormData).get('file')).toBe(file)
  })

  it('genera le domande dal documento', async () => {
    await generateSimulationQuestions('s-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/simulations/s-1/generate',
      options: { method: 'POST' },
    })
  })

  it('modifica titolo e descrizione', async () => {
    await updateSimulation('s-1', { title: 'Antiriciclaggio', description: 'Le verifiche' })
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/simulations/s-1',
      options: { method: 'PUT', body: { title: 'Antiriciclaggio', description: 'Le verifiche' } },
    })
  })

  /* Le domande si salvano tutte insieme e in PUT: quello che il docente ha
   * davanti è il serbatoio intero, e mandarne una parte cancellerebbe le
   * altre. */
  it('salva le domande tutte insieme', async () => {
    const domande = [{ position: 1, text: 'Domanda' }]
    await saveSimulationQuestions('s-1', domande as never)
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/simulations/s-1/questions',
      options: { method: 'PUT', body: { questions: domande } },
    })
  })

  it('pubblica e ritira da un indirizzo dedicato', async () => {
    await updateSimulationStatus('s-1', 'published')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/simulations/s-1/status',
      options: { method: 'PUT', body: { status: 'published' } },
    })
  })

  it('elimina la simulazione', async () => {
    await deleteSimulation('s-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/simulations/s-1',
      options: { method: 'DELETE' },
    })
  })

  /* Eliminare un tentativo cancella la fotografia di quelle risposte, non
   * la simulazione che le ha poste: per questo l'indirizzo è un altro. */
  it('elimina un tentativo senza toccare la simulazione', async () => {
    await deleteSimulationAttempt('t-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/simulation-attempts/t-1',
      options: { method: 'DELETE' },
    })
  })
})
