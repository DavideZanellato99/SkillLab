/* Cosa si può mettere accanto a cosa, nelle due metà del confronto.
 *
 * Due prove si affiancano per vedere se una persona è migliorata, e quella
 * lettura regge solo fra prove della stessa specie: una telefonata e una chat
 * scritta non si giudicano nello stesso modo, e nemmeno un test a crocette e
 * uno a risposta aperta, che sono corretti da due scale diverse. Senza un
 * filtro le due tendine offrono tutto quello che una persona ha fatto, e la
 * prima cosa che capita di scegliere è proprio il paio che non si legge.
 *
 * Le funzioni stanno qui e non nei due componenti perché sono le stesse: le
 * metà filtrano su cose diverse (canale e scenario da una parte, tipo di test
 * e test dall'altra) ma con le stesse tre regole, e scritte due volte
 * sarebbero due regole che prima o poi divergono. */

import type { SelectOption } from './Select'

/* Il valore con cui un filtro dice "senza restringere". È la stessa parola
 * che `ModeFilter` e `KindFilter` usano già per la loro voce "tutti": i
 * filtri a tendina di questa pagina e quelli a linguette della dashboard
 * parlano così la stessa lingua, e un solo `matchesFilter` li serve
 * entrambi. */
export const ANY = 'all'

/**
 * Le voci di un filtro ricavate dalle prove che ci sono davvero.
 *
 * Non da un elenco a parte: uno scenario che quella persona non ha mai
 * affrontato, offerto nella tendina, porta soltanto a una lista vuota senza
 * dire perché. Le voci sono in ordine alfabetico, che è l'ordine in cui si
 * cerca un nome, mentre "tutti" resta in testa perché è il punto di partenza
 * e non una scelta come le altre.
 */
export function filterOptions<T>(
  items: T[],
  valueOf: (item: T) => string,
  labelOf: (item: T) => string,
  anyLabel: string,
): SelectOption[] {
  const byValue = new Map<string, string>()
  for (const item of items) byValue.set(valueOf(item), labelOf(item))
  const options = [...byValue]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'it'))
  return [{ value: ANY, label: anyLabel }, ...options]
}

/** Se una prova passa un filtro, dove `ANY` lascia passare tutto. */
export function matchesFilter(filter: string, value: string): boolean {
  return filter === ANY || filter === value
}

/**
 * Il valore di un filtro che le prove rimaste sostengono ancora.
 *
 * Restringere il canale può portare via l'ultimo tentativo su quello
 * scenario, e allora lo scenario scelto non è più una scelta: è una
 * combinazione senza prove dentro. Torna a "tutti" invece di restare
 * selezionato mostrando una lista vuota.
 */
export function survivingFilter(options: SelectOption[], picked: string): string {
  return options.some((option) => option.value === picked) ? picked : ANY
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
 * Si propone il primo contro l'ultimo, che è il confronto che si vuole vedere
 * quasi sempre, e nell'ordine in cui si legge un miglioramento: il più
 * vecchio a sinistra.
 *
 * La scelta di chi guarda vince finché appartengono entrambe alla lista:
 * quando una non ci appartiene più (si è cambiata persona, o si è stretto un
 * filtro) si torna alla coppia proposta, perché tenere la sopravvissuta
 * accanto a un id che non esiste mostrerebbe mezzo confronto senza dire
 * perché. Sotto le due prove non c'è niente da affiancare, e la coppia resta
 * vuota.
 */
export function resolvePair<T>(items: T[], idOf: (item: T) => string, picked: Pair): Pair {
  if (items.length < 2) return NO_PAIR
  const belongs = (id: string) => items.some((item) => idOf(item) === id)
  if (belongs(picked.leftId) && belongs(picked.rightId) && picked.leftId !== picked.rightId) {
    return picked
  }
  return { leftId: idOf(items[0]), rightId: idOf(items[items.length - 1]) }
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
