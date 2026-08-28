/* Cosa si può mettere accanto a cosa, nelle due metà del confronto.
 *
 * Due prove si affiancano per vedere se una persona è migliorata, e quella
 * lettura regge solo fra prove della stessa specie: una telefonata e una chat
 * scritta non si giudicano nello stesso modo, e nemmeno un test a crocette e
 * uno a risposta aperta, che sono corretti da due scale diverse. Senza un
 * filtro le due tendine offrono tutto quello che una persona ha fatto, e la
 * prima cosa che capita di scegliere è proprio il paio che non si legge.
 *
 * I due filtri di ciascuna metà non si comportano però allo stesso modo, e la
 * differenza è quanto pesa mescolare. Il primo, la specie della prova, ha una
 * voce "tutti" e la tiene: guardare le chiamate e le chat insieme è una
 * lettura legittima di cosa una persona ha fatto, e affiancare due prove di
 * canali diversi si può, con un avviso che dice cosa si sta guardando. Il
 * secondo, il bersaglio, non ce l'ha: due conversazioni con clienti diversi
 * non hanno nessun confronto da mostrare, i criteri sono tarati su quello che
 * quel cliente chiede, e due tentativi su test diversi non hanno nemmeno le
 * stesse domande. "Tutti gli scenari" non era quindi un filtro aperto, era
 * una combinazione che non porta da nessuna parte, ed è sparito.
 *
 * Le funzioni stanno qui e non nei due componenti perché sono le stesse: le
 * metà filtrano su cose diverse (canale e scenario da una parte, tipo di test
 * e test dall'altra) ma con le stesse regole, e scritte due volte sarebbero
 * due regole che prima o poi divergono. */

import type { SelectOption } from './Select'

/* Il valore con cui il filtro della specie dice "senza restringere". È la
 * stessa parola che `ModeFilter` e `KindFilter` usano già per la loro voce
 * "tutti": i filtri di questa pagina e quelli della dashboard parlano così la
 * stessa lingua, e un solo `matchesFilter` li serve entrambi. */
export const ANY = 'all'

/** Se una prova passa il filtro della specie, dove `ANY` lascia passare tutto. */
export function matchesFilter(filter: string, value: string): boolean {
  return filter === ANY || filter === value
}

/**
 * Le voci del bersaglio ricavate dalle prove che ci sono davvero.
 *
 * Non da un elenco a parte: uno scenario che quella persona non ha mai
 * affrontato, offerto nella tendina, porta soltanto a una lista vuota senza
 * dire perché, e da quando la scelta è obbligatoria porterebbe a una pagina
 * che si apre su niente. Le voci sono in ordine alfabetico, che è l'ordine in
 * cui si cerca un nome. Nessuna voce "tutti" in testa: qui non si sceglie
 * quanto restringere, si sceglie di cosa si sta parlando.
 */
export function filterOptions<T>(
  items: T[],
  valueOf: (item: T) => string,
  labelOf: (item: T) => string,
): SelectOption[] {
  const byValue = new Map<string, string>()
  for (const item of items) byValue.set(valueOf(item), labelOf(item))
  return [...byValue]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'it'))
}

/**
 * Il bersaglio su cui la pagina si apre.
 *
 * Quello della prova più recente che ha una gemella, cioè la cosa più recente
 * su cui un confronto esiste davvero: la pagina si apre così su una risposta
 * invece che su un riquadro che chiede una seconda prova. Se nessuna prova si
 * ripete, il bersaglio dell'ultima svolta, che è comunque la cosa a cui si sta
 * pensando arrivando qui.
 *
 * Le prove arrivano dalla più vecchia alla più recente e si guardano
 * all'indietro: la prima che ripete una gemella già vista è quella la cui
 * coppia è la più recente di tutte.
 *
 * Cosa renda due prove gemelle può essere più stretto del bersaglio: lo
 * scenario su cui aprirsi è quello affrontato due volte sullo stesso canale, o
 * la pagina si aprirebbe su una coppia che il suo avviso deve subito scusare.
 * Perciò `keyOf` può essere più fine di `valueOf`, e per default è lui.
 *
 * Vuoto solo quando non c'è nessuna prova, e allora non c'è niente da
 * scegliere né da confrontare.
 */
export function defaultFilter<T, V extends string>(
  items: T[],
  valueOf: (item: T) => V,
  keyOf: (item: T) => string = valueOf,
): V | '' {
  const seen = new Set<string>()
  for (let i = items.length - 1; i >= 0; i--) {
    if (seen.has(keyOf(items[i]))) return valueOf(items[i])
    seen.add(keyOf(items[i]))
  }
  const last = items[items.length - 1]
  return last === undefined ? '' : valueOf(last)
}

/**
 * Il bersaglio corrente: la scelta di chi guarda finché le prove rimaste la
 * sostengono, altrimenti quello di partenza.
 *
 * Restringere il canale può portare via l'ultimo tentativo su quello
 * scenario, e cambiare persona li porta via tutti insieme. Il filtro non torna
 * aperto, perché aperto non è uno stato che esiste: torna sul bersaglio su cui
 * si sarebbe aperto per queste prove.
 */
export function chosenFilter(
  options: readonly SelectOption[],
  picked: string,
  fallback: string,
): string {
  return options.some((option) => option.value === picked) ? picked : fallback
}

/**
 * I due tentativi affiancati: quello da cui si parte e quello con cui si
 * finisce. I due posti sono distinti e hanno un nome, "prima" e "dopo", e
 * sono quelli che si leggono a sinistra e a destra in tutta la schermata.
 */
export interface Pair {
  leftId: string
  rightId: string
}

/** Il ruolo di una prova nel confronto, cioè in quale dei due posti sta. */
export type PairRole = keyof Pair

export const NO_PAIR: Pair = { leftId: '', rightId: '' }

/**
 * I due tentativi da affiancare, fra quelli rimasti dopo i filtri.
 *
 * Si propone l'ultima prova svolta contro la più recente che la precede sulla
 * stessa cosa (`groupOf`, cioè lo stesso canale: il bersaglio è già uno solo),
 * nell'ordine in cui si legge un miglioramento, il più vecchio a sinistra. È
 * la domanda con cui si arriva qui, l'ultima volta come è andata rispetto alla
 * precedente, ed è una coppia che non ha bisogno di avvisi.
 *
 * Prima si proponeva la prima contro l'ultima, e con i filtri aperti quella
 * coppia era spesso mista: la pagina si apriva sui propri avvisi, che dicevano
 * che i punteggi non sono comparabili prima ancora che qualcuno avesse scelto
 * qualcosa. Un avviso che c'è sempre smette di essere letto, e quando poi è
 * chi guarda a mescolare davvero non lo nota più.
 *
 * Senza `groupOf`, o quando l'ultima prova è l'unica del suo gruppo, resta la
 * prima contro l'ultima: sono comunque le due che si guardano.
 *
 * La scelta di chi guarda vince finché appartengono entrambe alla lista:
 * quando una non ci appartiene più (si è cambiata persona, o si è cambiato
 * filtro) si torna alla coppia proposta, perché tenere la sopravvissuta
 * accanto a un id che non esiste mostrerebbe mezzo confronto senza dire
 * perché. Sotto le due prove non c'è niente da affiancare, e la coppia resta
 * vuota.
 */
export function resolvePair<T>(
  items: T[],
  idOf: (item: T) => string,
  picked: Pair,
  /** Cosa rende due prove confrontabili senza avvisi, oltre al bersaglio che
   *  i filtri hanno già fissato: il canale, fra le conversazioni. */
  groupOf?: (item: T) => string,
): Pair {
  if (items.length < 2) return NO_PAIR
  const belongs = (id: string) => items.some((item) => idOf(item) === id)
  if (belongs(picked.leftId) && belongs(picked.rightId) && picked.leftId !== picked.rightId) {
    return picked
  }

  /* L'elenco arriva dal più vecchio al più recente, quindi l'ultima prova
     svolta è in fondo e la sua precedente si cerca all'indietro da lì. */
  const last = items[items.length - 1]
  const previous = groupOf
    ? items
        .slice(0, -1)
        .reverse()
        .find((item) => groupOf(item) === groupOf(last))
    : undefined
  return { leftId: idOf(previous ?? items[0]), rightId: idOf(last) }
}

/**
 * La coppia dopo che si è dato un posto a una prova.
 *
 * Il posto lo dice chi sceglie, con il comando che tocca sulla prova, e non
 * una regola che deve indovinare: la prova toccata prende quel posto e chi
 * c'era esce dal confronto.
 *
 * L'altra prova della coppia, se è proprio quella che si sta spostando, non
 * esce ma passa al posto rimasto libero. È l'unica cosa sensata da fare con
 * due prove sole: metterla fuori lascerebbe metà confronto, e tenerla dov'è
 * significherebbe confrontare una prova con se stessa.
 */
export function assignRole(current: Pair, role: PairRole, id: string): Pair {
  if (current[role] === id) return current
  const other: PairRole = role === 'leftId' ? 'rightId' : 'leftId'
  if (current[other] === id) return { ...current, [role]: id, [other]: current[role] } as Pair
  return { ...current, [role]: id }
}
