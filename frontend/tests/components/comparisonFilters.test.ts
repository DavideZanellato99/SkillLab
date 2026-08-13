import { describe, expect, it } from 'vitest'

import {
  ANY,
  assignRole,
  filterOptions,
  matchesFilter,
  NO_PAIR,
  resolvePair,
  survivingFilter,
} from '../../src/components/comparisonFilters'

/* Le tre regole che decidono cosa si può affiancare a cosa.
 *
 * Sono in un file loro perché le due metà del confronto le condividono, e
 * quello che va difeso qui è il comportamento nel momento in cui un filtro si
 * stringe: la coppia proposta e il filtro dipendente devono seguire le prove
 * rimaste, altrimenti la pagina resta ferma su una selezione che non esiste
 * più e mostra un confronto vuoto senza dire perché. */

interface Prova {
  id: string
  scenario: string
  nome: string
}

const prove: Prova[] = [
  { id: 'p1', scenario: 's-anna', nome: 'Anna Neri' },
  { id: 'p2', scenario: 's-bruno', nome: 'Bruno Verdi' },
  { id: 'p3', scenario: 's-anna', nome: 'Anna Neri' },
]

const id = (p: Prova) => p.id

describe('filterOptions', () => {
  it('offre ogni bersaglio una volta sola, in ordine alfabetico, con "tutti" in testa', () => {
    const options = filterOptions(
      prove,
      (p) => p.scenario,
      (p) => p.nome,
      'Tutti gli scenari',
    )

    expect(options).toEqual([
      { value: ANY, label: 'Tutti gli scenari' },
      { value: 's-anna', label: 'Anna Neri' },
      { value: 's-bruno', label: 'Bruno Verdi' },
    ])
  })

  it('non offre bersagli che le prove rimaste non hanno', () => {
    const options = filterOptions(
      prove.filter((p) => p.scenario === 's-anna'),
      (p) => p.scenario,
      (p) => p.nome,
      'Tutti gli scenari',
    )

    expect(options.map((o) => o.value)).toEqual([ANY, 's-anna'])
  })
})

describe('matchesFilter', () => {
  it('lascia passare tutto quando il filtro è aperto', () => {
    expect(matchesFilter(ANY, 'voice')).toBe(true)
    expect(matchesFilter(ANY, 'text')).toBe(true)
  })

  it('lascia passare solo il valore scelto quando il filtro è stretto', () => {
    expect(matchesFilter('voice', 'voice')).toBe(true)
    expect(matchesFilter('voice', 'text')).toBe(false)
  })
})

describe('survivingFilter', () => {
  const options = [
    { value: ANY, label: 'Tutti gli scenari' },
    { value: 's-anna', label: 'Anna Neri' },
  ]

  it('tiene la scelta finché le prove rimaste la sostengono', () => {
    expect(survivingFilter(options, 's-anna')).toBe('s-anna')
  })

  it('torna ad "aperto" quando la scelta non è più fra le voci', () => {
    /* Il caso vero: si è scelto uno scenario e poi si è stretto il canale,
       che di quello scenario porta via l'ultima prova. */
    expect(survivingFilter(options, 's-bruno')).toBe(ANY)
  })
})

describe('resolvePair', () => {
  it('propone la prima contro l ultima, la più vecchia a sinistra', () => {
    expect(resolvePair(prove, id, NO_PAIR)).toEqual({ leftId: 'p1', rightId: 'p3' })
  })

  it('tiene le scelte di chi guarda finché appartengono alla lista', () => {
    expect(resolvePair(prove, id, { leftId: 'p2', rightId: 'p3' })).toEqual({
      leftId: 'p2',
      rightId: 'p3',
    })
  })

  it('torna alla coppia proposta quando una scelta esce dalla lista', () => {
    const rimaste = prove.filter((p) => p.scenario === 's-anna')

    expect(resolvePair(rimaste, id, { leftId: 'p2', rightId: 'p3' })).toEqual({
      leftId: 'p1',
      rightId: 'p3',
    })
  })

  it('non propone niente quando non resta una coppia', () => {
    expect(resolvePair([prove[0]], id, NO_PAIR)).toEqual(NO_PAIR)
    expect(resolvePair([], id, { leftId: 'p1', rightId: 'p3' })).toEqual(NO_PAIR)
  })
})

describe('assignRole', () => {
  const coppia = { leftId: 'p1', rightId: 'p3' }

  it('mette la prova nel posto che si è toccato, al posto di chi c era', () => {
    expect(assignRole(coppia, 'leftId', 'p2')).toEqual({ leftId: 'p2', rightId: 'p3' })
    expect(assignRole(coppia, 'rightId', 'p2')).toEqual({ leftId: 'p1', rightId: 'p2' })
  })

  /* Con due prove sole, spostare quella che è già nell'altro posto non può
     buttarne fuori nessuna: i due si scambiano. */
  it('scambia i due posti quando si sposta la prova che sta nell altro', () => {
    expect(assignRole(coppia, 'leftId', 'p3')).toEqual({ leftId: 'p3', rightId: 'p1' })
  })

  it('non fa niente sul posto che quella prova ha già', () => {
    expect(assignRole(coppia, 'leftId', 'p1')).toBe(coppia)
  })
})
