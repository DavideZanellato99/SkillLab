/* Le viste della dashboard e i filtri che valgono per tutte.
 *
 * La sezione è un guscio con dentro quattro schermate (vedi DashboardPage):
 * ognuna è una domanda diversa sulle stesse prove, quindi ognuna è una rotta
 * sua, con il proprio file e la propria lettura. Cosa sono e come si
 * chiamano sta qui, perché lo leggono in tre: la barra delle linguette, il
 * titolo della pagina e l'elenco dei file da scaricare.
 *
 * Periodo e organizzazione sono del guscio e non delle singole viste: sono i
 * due filtri che il server capisce, cioè quelli che decidono quali righe
 * arrivano, e sono gli stessi per tutte e quattro. Chi cambia linguetta li
 * ritrova dove li ha lasciati, che è quello che tiene insieme la sezione.
 * Gli altri (la persona, il canale, il tipo di test) restringono righe già
 * arrivate e restano dentro la vista che li usa. */

import { useOutletContext } from 'react-router'
import type { PeriodValue } from './reportFormat'

/** La radice della sezione: ogni vista è un tratto dopo di questa. */
export const DASHBOARD_ROOT = '/app/admin/dashboard'

export const DASHBOARD_VIEWS = [
  {
    value: 'punteggi',
    label: 'Punteggi',
    description:
      'Riepilogo dei punteggi delle conversazioni valutate e dei test tecnici svolti, globale o per singolo utente.',
    superAdminOnly: false,
  },
  {
    value: 'percorsi',
    label: 'Percorsi',
    description:
      'Avanzamento dei percorsi affidati: quanti si chiudono, in quanto tempo e su quale tappa si ferma il gruppo.',
    superAdminOnly: false,
  },
  {
    value: 'contenuti',
    label: 'Contenuti',
    description:
      'Quanto sono difficili gli avatar e i test tecnici, con le domande di un test una per una.',
    superAdminOnly: false,
  },
  {
    value: 'utilizzo',
    label: 'Utilizzo',
    description:
      'Quanto la piattaforma viene usata, organizzazione per organizzazione, e quante persone si allenano davvero.',
    /* La domanda è quali organizzazioni sono ferme, e ha senso solo per chi
       ne guarda più di una: il server risponde 403 a chiunque altro. */
    superAdminOnly: true,
  },
] as const

export type DashboardView = (typeof DASHBOARD_VIEWS)[number]['value']

/** La vista di partenza, quella che l'indirizzo della sezione apre. */
export const DEFAULT_VIEW: DashboardView = 'punteggi'

/** L'indirizzo di una vista. */
export const dashboardPath = (view: DashboardView) => `${DASHBOARD_ROOT}/${view}`

/** La vista che si sta guardando, letta dall'indirizzo. */
export function viewFromPath(pathname: string): DashboardView {
  const found = DASHBOARD_VIEWS.find((view) => pathname.startsWith(dashboardPath(view.value)))
  return found ? found.value : DEFAULT_VIEW
}

/** Le linguette che questo ruolo vede. */
export function visibleViews(isSuperAdmin: boolean) {
  return DASHBOARD_VIEWS.filter((view) => !view.superAdminOnly || isSuperAdmin)
}

/**
 * Quello che il guscio passa alla vista: su quali righe si sta guardando.
 *
 * Viaggia nel contesto dell'`Outlet` e non nei parametri dell'indirizzo letti
 * di nuovo: l'indirizzo resta la loro unica copia, ma a interpretarlo è il
 * guscio, così le quattro viste non ne tengono quattro letture libere di
 * divergere.
 */
export interface DashboardScope {
  /** L'organizzazione scelta, vuoto per tutte. Vuoto anche per un org admin,
   *  a cui il server risponde comunque con la sua. */
  organizationId: string
  /** Gli ultimi N giorni, o undefined per «da sempre». */
  days?: number
  period: PeriodValue
}

export function useDashboardScope(): DashboardScope {
  return useOutletContext<DashboardScope>()
}
