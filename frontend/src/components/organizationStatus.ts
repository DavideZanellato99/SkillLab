/* Come si legge lo stato di un'organizzazione: la parola, il colore della
 * targhetta e le voci con cui lo si filtra.
 *
 * Fuori dalla pagina perché non è più roba sua soltanto: la tabella ci ordina
 * e ci cerca sopra, il dettaglio ci disegna la targhetta e la barra dei filtri
 * ne fa le proprie voci. È lo stesso posto che la gestione utenti ha già in
 * `adminUsersConfig`: le parole di uno stato si scrivono una volta, o le tre
 * copie finiscono a chiamare la stessa cosa in due modi. */

import type { OrgStatus } from '../services/organizations'

export const STATUS_LABELS: Record<OrgStatus, string> = {
  active: 'Attiva',
  suspended: 'Sospesa',
}

export const STATUS_BADGE_CLASSES: Record<OrgStatus, string> = {
  active: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  suspended: 'border border-amber-500/30 bg-amber-500/10 text-amber-400',
}

/* Le voci del filtro, con in cima quella che le comprende tutte: è il punto
 * di partenza, ed è la prima che si cerca per tornare all'elenco intero. */
export const STATUS_OPTIONS = [
  { value: '', label: 'Tutti gli stati' },
  ...(Object.keys(STATUS_LABELS) as OrgStatus[]).map((s) => ({
    value: s,
    label: STATUS_LABELS[s],
  })),
]
