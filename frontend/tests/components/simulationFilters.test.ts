import { describe, expect, it } from 'vitest'

import { filterSimulations } from '../../src/components/simulationFilters'
import type { Simulation } from '../../src/services/simulations'

/* Restringere l'elenco dei test è un giro su una lista già in memoria, e la
 * regola sta qui invece che dentro la pagina. Le due cose che questo file
 * tiene ferme: cosa vuol dire "da svolgere", e che la ricerca arrivi anche a
 * quello che sulla scheda non è scritto in lettere. */

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

const mai = simulazione({ id: 'mai', title: 'Mai svolto' })
const fatto = simulazione({ id: 'fatto', title: 'Già svolto', attempt_count: 2 })

describe('filterSimulations', () => {
  it('separa i test mai svolti da quelli già svolti', () => {
    expect(filterSimulations([mai, fatto], 'todo', '').map((s) => s.id)).toEqual(['mai'])
    expect(filterSimulations([mai, fatto], 'done', '').map((s) => s.id)).toEqual(['fatto'])
    expect(filterSimulations([mai, fatto], 'all', '').map((s) => s.id)).toEqual(['mai', 'fatto'])
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
    const aperta = simulazione({ id: 'aperta', title: 'Reclami', kind: 'open' })
    const scrittoAMano = simulazione({ id: 'mano', title: 'Cassa', source: 'manual' })
    const elenco = [mai, aperta, scrittoAMano]

    expect(filterSimulations(elenco, 'all', 'risposta aperta').map((s) => s.id)).toEqual(['aperta'])
    expect(filterSimulations(elenco, 'all', 'manuale').map((s) => s.id)).toEqual(['mano'])
  })

  it('applica insieme il filtro e la ricerca', () => {
    const altroFatto = simulazione({ id: 'altro', title: 'Bonifici esteri', attempt_count: 1 })
    const elenco = [mai, fatto, altroFatto]

    expect(filterSimulations(elenco, 'done', 'bonifici').map((s) => s.id)).toEqual(['altro'])
  })
})
