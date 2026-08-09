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
 * I due tentativi da affiancare, fra quelli rimasti dopo i filtri.
 *
 * Si propone il primo contro l'ultimo, che è il confronto che si vuole vedere
 * quasi sempre. La scelta di chi guarda vince finché appartiene ancora alla
 * lista: quando non ci appartiene più (si è cambiata persona, o si è stretto
 * un filtro) tenerla mostrerebbe un confronto vuoto senza dire perché.
 *
 * Con una prova sola non c'è nessun primo da mettere a sinistra: `leftId`
 * resta vuoto, e chi chiama lo legge come "non c'è niente da confrontare".
 */
export function pickPair<T>(
  items: T[],
  idOf: (item: T) => string,
  pickedLeft: string,
  pickedRight: string,
): { leftId: string; rightId: string } {
  const belongs = (id: string) => items.some((item) => idOf(item) === id)
  return {
    leftId: belongs(pickedLeft) ? pickedLeft : items.length > 1 ? idOf(items[0]) : '',
    rightId: belongs(pickedRight)
      ? pickedRight
      : items.length > 0
        ? idOf(items[items.length - 1])
        : '',
  }
}
