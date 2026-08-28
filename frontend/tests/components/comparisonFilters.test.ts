import { describe, expect, it } from 'vitest'

import {
  ANY,
  assignRole,
  chosenFilter,
  defaultFilter,
  filterOptions,
  matchesFilter,
  NO_PAIR,
  resolvePair,
} from '../../src/components/comparisonFilters'

/* Le regole che decidono cosa si può affiancare a cosa.
 *
 * Sono in un file loro perché le due metà del confronto le condividono, e
 * quello che va difeso qui è il comportamento nel momento in cui un filtro si
 * stringe: la coppia proposta e il bersaglio devono seguire le prove rimaste,
 * altrimenti la pagina resta ferma su una selezione che non esiste più e
 * mostra un confronto vuoto senza dire perché.
 *
 * I due filtri di una metà non si comportano allo stesso modo: la specie ha
 * una voce "tutti", il bersaglio no, perché due bersagli diversi non hanno
 * nessun confronto da mostrare. Il bersaglio ha quindi sempre un valore, e da
 * dove esce quel valore quando nessuno ha ancora scelto niente è la prima
 * cosa che questi test tengono ferma. */

interface Prova {
  id: string
  scenario: string
  nome: string
  canale: string
}

const prove: Prova[] = [
  { id: 'p1', scenario: 's-anna', nome: 'Anna Neri', canale: 'voce' },
  { id: 'p2', scenario: 's-bruno', nome: 'Bruno Verdi', canale: 'voce' },
  { id: 'p3', scenario: 's-anna', nome: 'Anna Neri', canale: 'chat' },
]

const id = (p: Prova) => p.id
const scenario = (p: Prova) => p.scenario
const canaleEScenario = (p: Prova) => `${p.canale}|${p.scenario}`

describe('filterOptions', () => {
  it('offre ogni bersaglio una volta sola, in ordine alfabetico, senza voce "tutti"', () => {
    const options = filterOptions(prove, scenario, (p) => p.nome)

    expect(options).toEqual([
      { value: 's-anna', label: 'Anna Neri' },
      { value: 's-bruno', label: 'Bruno Verdi' },
    ])
  })

  it('non offre bersagli che le prove rimaste non hanno', () => {
    const options = filterOptions(
      prove.filter((p) => p.canale === 'chat'),
      scenario,
      (p) => p.nome,
    )

    expect(options.map((o) => o.value)).toEqual(['s-anna'])
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

describe('defaultFilter', () => {
  /* Anna al telefono, Bruno al telefono, Bruno in chat, Anna di nuovo al
     telefono: l'ultima prova è di Anna, ma qual è l'ultimo bersaglio ripetuto
     dipende da cosa si considera una ripetizione. */
  const miste: Prova[] = [
    { id: 'm1', scenario: 's-anna', nome: 'Anna Neri', canale: 'voce' },
    { id: 'm2', scenario: 's-bruno', nome: 'Bruno Verdi', canale: 'voce' },
    { id: 'm3', scenario: 's-bruno', nome: 'Bruno Verdi', canale: 'chat' },
    { id: 'm4', scenario: 's-anna', nome: 'Anna Neri', canale: 'voce' },
  ]

  it('parte dal bersaglio più recente affrontato due volte', () => {
    expect(defaultFilter(miste, scenario)).toBe('s-bruno')
  })

  it('conta come ripetute solo le prove gemelle secondo la chiave', () => {
    /* Bruno è stato affrontato due volte, ma su due canali diversi, e la
       coppia che ne uscirebbe si aprirebbe sul proprio avviso. Anna al
       telefono no. */
    expect(defaultFilter(miste, scenario, canaleEScenario)).toBe('s-anna')
  })

  it('parte dal bersaglio dell ultima prova quando nessuna si ripete', () => {
    expect(defaultFilter([miste[0], miste[1]], scenario)).toBe('s-bruno')
  })

  it('resta vuoto quando non c è nessuna prova', () => {
    expect(defaultFilter([], scenario)).toBe('')
  })
})

describe('chosenFilter', () => {
  const options = [
    { value: 's-anna', label: 'Anna Neri' },
    { value: 's-bruno', label: 'Bruno Verdi' },
  ]

  it('tiene la scelta finché le prove rimaste la sostengono', () => {
    expect(chosenFilter(options, 's-anna', 's-bruno')).toBe('s-anna')
  })

  it('parte dal bersaglio di partenza quando non si è ancora scelto niente', () => {
    expect(chosenFilter(options, '', 's-bruno')).toBe('s-bruno')
  })

  it('torna al bersaglio di partenza quando la scelta non è più fra le voci', () => {
    /* Il caso vero: si è scelto uno scenario e poi si è stretto il canale,
       che di quello scenario porta via l'ultima prova. */
    expect(chosenFilter(options, 's-carla', 's-anna')).toBe('s-anna')
  })
})

describe('resolvePair', () => {
  it('propone la prima contro l ultima, la più vecchia a sinistra', () => {
    expect(resolvePair(prove, id, NO_PAIR)).toEqual({ leftId: 'p1', rightId: 'p3' })
  })

  /* Con un gruppo, la coppia proposta non mescola: è l'ultima prova contro la
     più recente che la precede sullo stesso canale. */
  it('propone l ultima contro la precedente dello stesso gruppo', () => {
    const canali: Prova[] = [
      { id: 'v1', scenario: 's-anna', nome: 'Anna Neri', canale: 'voce' },
      { id: 'c1', scenario: 's-anna', nome: 'Anna Neri', canale: 'chat' },
      { id: 'v2', scenario: 's-anna', nome: 'Anna Neri', canale: 'voce' },
    ]

    expect(resolvePair(canali, id, NO_PAIR, (p) => p.canale)).toEqual({
      leftId: 'v1',
      rightId: 'v2',
    })
  })

  it('resta la prima contro l ultima quando l ultima è sola nel suo gruppo', () => {
    expect(resolvePair(prove, id, NO_PAIR, (p) => p.canale)).toEqual({
      leftId: 'p1',
      rightId: 'p3',
    })
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
