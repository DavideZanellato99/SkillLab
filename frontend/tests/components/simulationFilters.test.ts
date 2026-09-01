import { describe, expect, it } from 'vitest'

import {
  ADMIN_KIND_OPTIONS,
  ADMIN_SOURCE_OPTIONS,
  ADMIN_STATUS_OPTIONS,
  NO_ADMIN_FILTERS,
  filterAdminSimulations,
  filterSimulations,
  kindFilterOptions,
} from '../../src/components/simulationFilters'
import type { AdminSimulationFilters } from '../../src/components/simulationFilters'
import type { AdminSimulation, Simulation } from '../../src/services/simulations'

/* Restringere l'elenco dei test è un giro su una lista già in memoria, e la
 * regola sta qui invece che dentro la pagina. Le due cose che questo file
 * tiene ferme: che si restringa per tipo di test, e che la ricerca arrivi
 * anche a quello che sulla scheda non è scritto in lettere. */

const simulazione = (over: Partial<Simulation> = {}): Simulation => ({
  id: 's-1',
  organization_id: 'org-1',
  organization_name: 'Banca Esempio',
  title: 'Normativa antiriciclaggio',
  description: 'Le verifiche da fare prima di aprire un rapporto',
  status: 'published',
  kind: 'multiple',
  source: 'ai',
  document_name: 'normativa.pdf',
  question_count: 10,
  created_at: '2026-01-01T10:00:00',
  updated_at: '2026-01-01T10:00:00',
  last_attempt_at: null,
  last_attempt_score: null,
  attempt_count: 0,
  ...over,
})

/** La stessa riga come la vede chi i test li prepara, con la firma di chi
 *  l'ha scritta. */
const adminSimulazione = (over: Partial<AdminSimulation> = {}): AdminSimulation => ({
  ...simulazione(),
  created_by_email: 'admin@esempio.it',
  updated_by_email: 'admin@esempio.it',
  ...over,
})

const mai = simulazione({ id: 'mai', title: 'Mai svolto' })
const fatto = simulazione({ id: 'fatto', title: 'Già svolto', attempt_count: 2 })

const aperta = simulazione({ id: 'aperta', title: 'Reclami', kind: 'open' })

describe('filterSimulations', () => {
  it('restringe al tipo di test scelto', () => {
    expect(filterSimulations([mai, aperta], 'open', '').map((s) => s.id)).toEqual(['aperta'])
    expect(filterSimulations([mai, aperta], 'multiple', '').map((s) => s.id)).toEqual(['mai'])
    expect(filterSimulations([mai, aperta], 'all', '').map((s) => s.id)).toEqual(['mai', 'aperta'])
  })

  it('cerca nel titolo e nella descrizione, senza badare ad accenti e maiuscole', () => {
    const elenco = [simulazione()]
    expect(filterSimulations(elenco, 'all', 'ANTIRICICLAGGIO')).toHaveLength(1)
    expect(filterSimulations(elenco, 'all', 'aprire un rapporto')).toHaveLength(1)
    expect(filterSimulations(elenco, 'all', 'sportello')).toHaveLength(0)
  })

  /* Il tipo sulla scheda è scritto in minuscolo e l'origine è solo un'icona:
   * chi cerca "aperta" o "manuale" sta cercando quelle, e senza questo non
   * troverebbe niente. */
  it('trova anche per tipo di test e per chi ha scritto le domande', () => {
    const scrittoAMano = simulazione({ id: 'mano', title: 'Cassa', source: 'manual' })
    const elenco = [mai, aperta, scrittoAMano]

    expect(filterSimulations(elenco, 'all', 'risposta aperta').map((s) => s.id)).toEqual(['aperta'])
    expect(filterSimulations(elenco, 'all', 'manuale').map((s) => s.id)).toEqual(['mano'])
  })

  it('applica insieme il filtro e la ricerca', () => {
    const altraAperta = simulazione({ id: 'altro', title: 'Bonifici esteri', kind: 'open' })
    const elenco = [mai, aperta, altraAperta]

    expect(filterSimulations(elenco, 'open', 'bonifici').map((s) => s.id)).toEqual(['altro'])
  })
})

/* Le pastiglie sopra la griglia. Quello che questo blocco tiene fermo è che
 * non ne compaia nessuna che porta a una griglia vuota, e che l'ordine dei
 * tipi non dipenda da com'è fatto il catalogo. */
describe('kindFilterOptions', () => {
  it('porta solo i tipi presenti, in ordine, con quanti ne contengono', () => {
    const abbinamento = simulazione({ id: 'coppie', kind: 'matching' })
    const options = kindFilterOptions([aperta, abbinamento, mai, fatto])

    expect(options).toEqual([
      { value: 'all', label: 'Tutti', count: 4 },
      { value: 'multiple', label: 'Scelta multipla', count: 2 },
      { value: 'open', label: 'Risposta aperta', count: 1 },
      { value: 'matching', label: 'Abbinamento', count: 1 },
    ])
  })

  it('su un catalogo vuoto resta la sola pastiglia di tutti', () => {
    expect(kindFilterOptions([])).toEqual([{ value: 'all', label: 'Tutti', count: 0 }])
  })
})

describe('filterAdminSimulations', () => {
  const bozza = adminSimulazione({ id: 'bozza', title: 'Reclami', status: 'draft' })
  const pubblicata = adminSimulazione({ id: 'pubblicata', title: 'Bonifici esteri' })

  /* Le due tendine viaggiano insieme, e ogni prova ne cambia una sola: così
     si legge quale delle due sta restringendo l'elenco. */
  const filtri = (over: Partial<AdminSimulationFilters> = {}): AdminSimulationFilters => ({
    ...NO_ADMIN_FILTERS,
    ...over,
  })

  it('mostra tutto finché non si sceglie', () => {
    expect(filterAdminSimulations([bozza, pubblicata], filtri(), '', true)).toHaveLength(2)
  })

  /* La domanda che si fa chi apre la gestione: quali test sono rimasti a
     metà. */
  it('separa le bozze da finire dalle simulazioni pubblicate', () => {
    const elenco = [bozza, pubblicata]

    expect(
      filterAdminSimulations(elenco, filtri({ status: 'draft' }), '', true).map((s) => s.id),
    ).toEqual(['bozza'])
    expect(
      filterAdminSimulations(elenco, filtri({ status: 'published' }), '', true).map((s) => s.id),
    ).toEqual(['pubblicata'])
  })

  /* L'altra domanda: scrivere dieci domande a crocette e dieci da correggere
     a mano sono due lavori diversi. */
  it('restringe al tipo di test', () => {
    const aperta = adminSimulazione({ id: 'aperta', title: 'Cassa', kind: 'open' })
    const elenco = [pubblicata, aperta]

    expect(
      filterAdminSimulations(elenco, filtri({ kind: 'open' }), '', true).map((s) => s.id),
    ).toEqual(['aperta'])
    expect(filterAdminSimulations(elenco, filtri({ kind: 'matching' }), '', true)).toHaveLength(0)
  })

  /* La terza domanda: le domande di un modello sono quelle da rileggere. */
  it('restringe a chi ha scritto le domande', () => {
    const aMano = adminSimulazione({ id: 'mano', title: 'Sportello', source: 'manual' })
    const elenco = [pubblicata, aMano]

    expect(
      filterAdminSimulations(elenco, filtri({ source: 'manual' }), '', true).map((s) => s.id),
    ).toEqual(['mano'])
    expect(
      filterAdminSimulations(elenco, filtri({ source: 'ai' }), '', true).map((s) => s.id),
    ).toEqual(['pubblicata'])
  })

  it('cerca nel titolo, nel documento, nel tipo e in chi ha scritto le domande', () => {
    const aperta = adminSimulazione({ id: 'aperta', title: 'Cassa', kind: 'open' })
    const aMano = adminSimulazione({ id: 'mano', title: 'Sportello', source: 'manual' })
    const elenco = [pubblicata, aperta, aMano]

    expect(filterAdminSimulations(elenco, filtri(), 'bonifici', true).map((s) => s.id)).toEqual([
      'pubblicata',
    ])
    expect(filterAdminSimulations(elenco, filtri(), 'normativa.pdf', true)).toHaveLength(3)
    expect(
      filterAdminSimulations(elenco, filtri(), 'risposta aperta', true).map((s) => s.id),
    ).toEqual(['aperta'])
    expect(filterAdminSimulations(elenco, filtri(), 'manuale', true).map((s) => s.id)).toEqual([
      'mano',
    ])
  })

  /* Per chi ne amministra una sola l'organizzazione non è in tabella, e
     cercarla restituirebbe tutto: quella riga non si cerca dove non si vede. */
  it("cerca l'organizzazione solo dove la si legge", () => {
    const elenco = [pubblicata]

    expect(filterAdminSimulations(elenco, filtri(), 'Banca Esempio', true)).toHaveLength(1)
    expect(filterAdminSimulations(elenco, filtri(), 'Banca Esempio', false)).toHaveLength(0)
  })

  it('applica insieme lo stato, il tipo e la ricerca', () => {
    const altraBozza = adminSimulazione({ id: 'altra', title: 'Bonifici interni', status: 'draft' })
    const bozzaAperta = adminSimulazione({
      id: 'aperta',
      title: 'Bonifici aperti',
      status: 'draft',
      kind: 'open',
    })
    const elenco = [bozza, pubblicata, altraBozza, bozzaAperta]

    expect(
      filterAdminSimulations(elenco, filtri({ status: 'draft' }), 'bonifici', true).map(
        (s) => s.id,
      ),
    ).toEqual(['altra', 'aperta'])
    expect(
      filterAdminSimulations(
        elenco,
        filtri({ status: 'draft', kind: 'open' }),
        'bonifici',
        true,
      ).map((s) => s.id),
    ).toEqual(['aperta'])
  })
})

/* Le tendine della barra: la voce che non restringe niente sta in cima, e i
   quattro tipi ci sono sempre, anche dove il catalogo non li ha. */
describe('le opzioni della gestione', () => {
  it('parte dalla voce che non restringe', () => {
    expect(ADMIN_STATUS_OPTIONS[0]).toEqual({ value: 'all', label: 'Tutti gli stati' })
    expect(ADMIN_KIND_OPTIONS[0]).toEqual({ value: 'all', label: 'Tutti i tipi' })
    expect(ADMIN_SOURCE_OPTIONS[0]).toEqual({ value: 'all', label: 'Tutte le origini' })
  })

  /* Le stesse due parole del tooltip della targhetta, che sulla riga è solo
     un'icona. */
  it('elenca le due origini con le parole della targhetta', () => {
    expect(ADMIN_SOURCE_OPTIONS.map((o) => o.label)).toEqual(['Tutte le origini', 'IA', 'Manuale'])
  })

  it('elenca i quattro tipi di test', () => {
    expect(ADMIN_KIND_OPTIONS.map((o) => o.value)).toEqual([
      'all',
      'multiple',
      'open',
      'ordering',
      'matching',
    ])
  })
})
