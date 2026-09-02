/* Le pagine che il browser scarica solo entrandoci, in un elenco solo.
 *
 * Stavano dentro App.tsx, dove servivano a `lazy` e a nessun altro. Ora le
 * chiede anche la barra di navigazione: per far partire il file prima del
 * click deve poter chiamare lo stesso `import()` della rotta, e due elenchi
 * separati sarebbero una voce che precarica un file e poi ne apre un altro.
 *
 * Il confine di cosa sta qui è quello dei permessi, non una misura di comodo:
 * sotto ci sono le schermate di amministrazione, che chi si allena non apre
 * mai, e il sito pubblico, che chi ha la sessione aperta non vede più. Vedi
 * il commento delle rotte in App.tsx.
 */

import { lazy } from 'react'
import type { ComponentType } from 'react'

type PageImport = () => Promise<{ default: ComponentType }>

/* La chiave è l'indirizzo della rotta, che è anche il `to` della voce di
 * navigazione (vedi `navEntries`): chi precarica ha in mano quello e non il
 * nome del file. */
const adminImports = {
  '/app/admin': () => import('./AdminPage'),
  '/app/admin/organizations': () => import('./OrganizationsPage'),
  '/app/admin/dashboard': () => import('./DashboardPage'),
  '/app/admin/training': () => import('./TrainingPage'),
  '/app/admin/report': () => import('./UserReportPage'),
  '/app/admin/avatars': () => import('./AvatarAdminPage'),
  '/app/admin/simulations': () => import('./SimulationAdminPage'),
  '/app/admin/logs': () => import('./AuditLogsPage'),
} satisfies Record<string, PageImport>

export const AdminPage = lazy(adminImports['/app/admin'])
export const OrganizationsPage = lazy(adminImports['/app/admin/organizations'])
export const DashboardPage = lazy(adminImports['/app/admin/dashboard'])
export const TrainingPage = lazy(adminImports['/app/admin/training'])
export const UserReportPage = lazy(adminImports['/app/admin/report'])
export const AvatarAdminPage = lazy(adminImports['/app/admin/avatars'])
export const SimulationAdminPage = lazy(adminImports['/app/admin/simulations'])
export const AuditLogsPage = lazy(adminImports['/app/admin/logs'])

export const PublicLayout = lazy(() => import('./public/PublicLayout'))
export const PublicHome = lazy(() => import('./public/PublicHome'))

/**
 * Fa partire il file di una pagina prima che qualcuno ci entri.
 *
 * Lo chiamano le voci di navigazione quando il puntatore ci passa sopra o
 * quando prendono il fuoco da tastiera: fra quel momento e il click c'è
 * qualche decimo di secondo, che è quanto basta perché il file arrivi e la
 * pagina si apra senza attesa. Chi non ci passa mai non scarica niente, che
 * è il motivo per cui queste pagine stanno a parte.
 *
 * Un indirizzo che non è di questo elenco (la galleria, la chat, il proprio
 * profilo) non ha niente da scaricare e non fa niente. Chiamarlo due volte
 * sullo stesso indirizzo nemmeno: un modulo già chiesto il browser non lo
 * richiede, `import()` restituisce la stessa promessa di prima.
 *
 * Quello che viene dopo `?` non conta: certi collegamenti portano alla
 * pagina già filtrata (la scheda di un'organizzazione apre i suoi utenti con
 * `?organization_id=`), ed è sempre lo stesso file da scaricare.
 */
export function prefetchPage(path: string): void {
  const route = path.split(/[?#]/)[0]
  const load: PageImport | undefined = adminImports[route as keyof typeof adminImports]
  if (load) void load()
}

/**
 * Le due manopole con cui una voce di navigazione chiede il proprio
 * precarico, da mettere sul `Link`.
 *
 * Sono due perché ci si arriva in due modi: il puntatore che entra nella
 * voce, e il fuoco della tastiera che ci si posa. Stanno qui e non ricopiate
 * in ognuno dei tre posti in cui una voce si presenta, così una sezione
 * nuova precarica senza che nessuno se ne ricordi.
 */
export function prefetchOnHover(path: string) {
  return {
    onPointerEnter: () => prefetchPage(path),
    onFocus: () => prefetchPage(path),
  }
}
