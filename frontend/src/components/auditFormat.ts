/* Come si legge una riga del registro attività: l'esito di una richiesta e il
 * riassunto di quello che ha toccato.
 *
 * Sta fuori dai componenti perché è tutto calcolo su dati, senza niente da
 * disegnare, e perché è la parte che i test possono interrogare direttamente
 * invece di cercarla dentro una tabella. */

import type { AuditLog } from '../services/auditLogs'
import type { DataTableColumn } from './DataTable'

/* Le colonne della tabella. Stanno qui, accanto al resto di come una riga si
 * legge, per la ragione per cui ci stanno quelle della gestione utenti: la
 * pagina che le passa e il componente che disegna le celle devono contarle
 * uguale, e il pannello che si apre sotto deve sapere quante attraversarne.
 *
 * Le percentuali sommano a 100. La data e ora non va a capo, quindi la sua
 * colonna è tarata sulla riga intera ("31/12/2025, 23:59:59"); l'oggetto si
 * prende quello che avanza perché è l'unica colonna dal contenuto lungo. */
/* Le quattro colonne ordinabili sono quelle che il server sa ordinare (vedi
 * routers/audit_logs.AUDIT_SORT_COLUMNS), e la chiave è la stessa da una
 * parte e dall'altra: qui il registro arriva a finestre, quindi l'ordine non
 * lo può fare la tabella su quello che ha in mano.
 *
 * L'oggetto e l'esito restano fuori: il primo è un riassunto composto a
 * lettura, il secondo un codice tradotto in tre parole, e nessuno dei due è
 * una colonna del database su cui si possa ordinare l'intero registro. */
export const AUDIT_COLUMNS: DataTableColumn<AuditLog>[] = [
  { key: 'data', label: 'Data e Ora', width: '15%', sortable: true },
  { key: 'utente', label: 'Utente', width: '20%', sortable: true },
  { key: 'organizzazione', label: 'Organizzazione', width: '14%', sortable: true },
  { key: 'azione', label: 'Azione', width: '15%', sortable: true },
  { key: 'oggetto', label: 'Oggetto', width: '22%' },
  { key: 'esito', label: 'Esito', compact: true, width: '8%' },
  { key: 'dettaglio', ariaLabel: 'Dettaglio', width: '6%' },
]

/** I filtri della barra, senza la ricerca, che vive nella tabella. */
export interface AuditLogsFiltersValue {
  action: string
  organizationId: string
  dateFrom: string
  dateTo: string
}

export const NO_AUDIT_FILTERS: AuditLogsFiltersValue = {
  action: '',
  organizationId: '',
  dateFrom: '',
  dateTo: '',
}

/** I tre esiti che il registro distingue, e che il colore già racconta. */
export type AuditOutcome = 'ok' | 'refused' | 'failed'

/* Il confine è il 400, cioè quello fra "il server ha fatto" e "il server ha
 * detto di no": un 3xx è una risposta riuscita, e metterlo fra le rifiutate
 * lo dipingeva d'ambra come un permesso negato. */
export function statusOutcome(status: number): AuditOutcome {
  if (status < 400) return 'ok'
  if (status < 500) return 'refused'
  return 'failed'
}

/* Verde se è andata a buon fine, ambra se è stata rifiutata, rosso se il
 * server è andato in errore. */
export const OUTCOME_CLASSES: Record<AuditOutcome, string> = {
  ok: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
  refused: 'border-amber-500/25 bg-amber-500/10 text-amber-400',
  failed: 'border-red-500/25 bg-red-500/10 text-red-300',
}

/* Cosa vuol dire il numero, per chi il numero non lo sa a memoria. La
 * colonna mostra il codice HTTP, che è il dato vero e serve quando si sta
 * indagando su una richiesta precisa; la frase gli sta accanto nel tooltip,
 * perché "403" e "422" sono la stessa cosa solo per chi li ha già visti. */
export const OUTCOME_MEANINGS: Record<AuditOutcome, string> = {
  ok: 'Azione riuscita',
  refused: 'Azione rifiutata: dati non validi, permessi mancanti o risorsa inesistente',
  failed: "Errore del server: l'azione non è andata a buon fine",
}

/** La voce di un dettaglio come si legge in tabella: la chiave così come
 *  l'endpoint l'ha attaccata porta gli underscore ("utenti_eliminati"), che
 *  sono un modo di scrivere per il codice, non per chi legge. */
export function detailLabel(key: string): string {
  return key.replace(/_/g, ' ')
}

/** Il valore di un dettaglio: una lista si legge come un elenco, non come
 *  la sua rappresentazione in JSON. */
export function detailValue(value: unknown): string {
  return Array.isArray(value) ? value.join(', ') : String(value)
}

/** Una voce del riassunto di una riga. */
export interface AuditDetail {
  key: string
  label: string
  value: string
}

/**
 * Il riassunto di una riga: quello che l'endpoint ha allegato, altrimenti
 * l'id della risorsa toccata, altrimenti niente.
 *
 * Restituisce le voci separate invece di una stringa già composta perché in
 * tabella la chiave e il valore non si vestono uguale: la prima è
 * l'etichetta, il secondo è la cosa che si sta cercando con l'occhio.
 */
export function summarize(log: AuditLog): AuditDetail[] {
  if (log.details) {
    const parts = Object.entries(log.details)
      .filter(([, value]) => value !== null && value !== '')
      .map(([key, value]) => ({ key, label: detailLabel(key), value: detailValue(value) }))
    if (parts.length) return parts
  }
  if (log.resource_id) {
    return [{ key: 'resource_id', label: 'id', value: log.resource_id }]
  }
  return []
}
