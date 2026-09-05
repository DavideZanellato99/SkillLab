/* Le pagine che il browser scarica solo entrandoci, in un elenco solo.
 *
 * Stavano dentro App.tsx, dove servivano a `lazy` e a nessun altro. Ora le
 * chiede anche la barra di navigazione: per far partire il file prima del
 * click deve poter chiamare lo stesso `import()` della rotta, e due elenchi
 * separati sarebbero una voce che precarica un file e poi ne apre un altro.
 *
 * **Qui dentro c'è ogni pagina dell'applicazione**, non solo quelle di
 * amministrazione. Il confine era quello dei permessi, ed era troppo stretto:
 * chi apriva il sito pubblico si portava a casa comunque la chat, la
 * telefonata con il suo ricampionamento del microfono, il simulatore, il
 * confronto e i percorsi, cioè metà del primo file speso in schermate che
 * senza una sessione non esistono. Adesso nel primo file resta quello che
 * vale da entrambe le parti (la barra, la modale di accesso, le rotte) e
 * ogni pagina arriva a chi ci entra.
 *
 * Il prezzo è un viaggio in più la prima volta che si apre una sezione, ed è
 * il motivo per cui `prefetchPage` esiste: le voci della barra e le tessere
 * che portano a una pagina fanno partire il file al passaggio del puntatore,
 * quindi quel viaggio è già finito quando arriva il click.
 */

import { lazy } from 'react'
import type { ComponentType } from 'react'

type PageImport = () => Promise<{ default: ComponentType }>

/* Le pagine che stanno dietro un indirizzo fisso. La chiave è l'indirizzo
 * della rotta, che è anche il `to` della voce di navigazione (vedi
 * `navEntries`): chi precarica ha in mano quello e non il nome del file. */
const exactImports = {
  '/app': () => import('./HomePage'),
  '/app/profile': () => import('./ProfilePage'),
  '/app/percorsi': () => import('./MyPathsRoute'),
  '/app/progressi': () => import('./ProgressPage'),
  '/app/confronto': () => import('./ComparisonPage'),
  '/app/simulatore': () => import('./SimulationsPage'),
  '/app/admin': () => import('./AdminPage'),
  '/app/admin/organizations': () => import('./OrganizationsPage'),
  '/app/admin/dashboard': () => import('./DashboardPage'),
  /* Le quattro viste della dashboard, una per rotta: il guscio arriva
     entrando nella sezione, la vista quando la si apre. Le linguette fanno
     partire il file al passaggio del puntatore, come le voci della barra. */
  '/app/admin/dashboard/punteggi': () => import('./DashboardScores'),
  '/app/admin/dashboard/percorsi': () => import('./DashboardPaths'),
  '/app/admin/dashboard/contenuti': () => import('./DashboardContent'),
  '/app/admin/dashboard/utilizzo': () => import('./DashboardUsage'),
  '/app/admin/training': () => import('./TrainingPage'),
  '/app/admin/report': () => import('./UserReportPage'),
  '/app/admin/avatars': () => import('./AvatarAdminPage'),
  '/app/admin/simulations': () => import('./SimulationAdminPage'),
  '/app/admin/logs': () => import('./AuditLogsPage'),
} satisfies Record<string, PageImport>

/* Le pagine che stanno dietro un indirizzo con dentro un id. La chiave è il
 * tratto che viene prima dell'id, perché è l'id a cambiare i dati della
 * pagina, non il file da scaricare: la chat di un avatar e quella di un
 * altro sono lo stesso file.
 *
 * Ci si arriva dalle tessere della galleria, dell'elenco percorsi e del
 * simulatore, che precaricano al passaggio del puntatore esattamente come le
 * voci della barra. */
const prefixImports = {
  '/app/chat/': () => import('./ChatPage'),
  '/app/percorsi/': () => import('./PathMapPage'),
  '/app/simulatore/': () => import('./SimulationRunner'),
} satisfies Record<string, PageImport>

export const HomePage = lazy(exactImports['/app'])
export const ProfilePage = lazy(exactImports['/app/profile'])
export const MyPathsRoute = lazy(exactImports['/app/percorsi'])
export const ProgressPage = lazy(exactImports['/app/progressi'])
export const ComparisonPage = lazy(exactImports['/app/confronto'])
export const SimulationsPage = lazy(exactImports['/app/simulatore'])
export const AdminPage = lazy(exactImports['/app/admin'])
export const OrganizationsPage = lazy(exactImports['/app/admin/organizations'])
export const DashboardPage = lazy(exactImports['/app/admin/dashboard'])
export const DashboardScores = lazy(exactImports['/app/admin/dashboard/punteggi'])
export const DashboardPaths = lazy(exactImports['/app/admin/dashboard/percorsi'])
export const DashboardContent = lazy(exactImports['/app/admin/dashboard/contenuti'])
export const DashboardUsage = lazy(exactImports['/app/admin/dashboard/utilizzo'])
export const TrainingPage = lazy(exactImports['/app/admin/training'])
export const UserReportPage = lazy(exactImports['/app/admin/report'])
export const AvatarAdminPage = lazy(exactImports['/app/admin/avatars'])
export const SimulationAdminPage = lazy(exactImports['/app/admin/simulations'])
export const AuditLogsPage = lazy(exactImports['/app/admin/logs'])

export const ChatPage = lazy(prefixImports['/app/chat/'])
export const PathMapPage = lazy(prefixImports['/app/percorsi/'])
export const SimulationRunner = lazy(prefixImports['/app/simulatore/'])

export const PublicLayout = lazy(() => import('./public/PublicLayout'))
export const PublicHome = lazy(() => import('./public/PublicHome'))

/**
 * Il file che serve per aprire un indirizzo, se quell'indirizzo è di una
 * pagina di qui.
 *
 * Prima l'elenco degli indirizzi fissi, poi quello dei tratti: sono due
 * ricerche e non una perché `/app/simulatore` e `/app/simulatore/<id>` sono
 * due pagine diverse, l'elenco dei test e il test che si sta svolgendo, e a
 * distinguerle è esattamente la barra in fondo.
 *
 * Sta a parte da `prefetchPage` per poterla provare senza scaricare niente:
 * qui si sceglie il file, di là lo si chiede.
 */
export function pageImportFor(path: string): PageImport | undefined {
  /* Quello che viene dopo `?` non conta: certi collegamenti portano alla
     pagina già filtrata (la scheda di un'organizzazione apre i suoi utenti
     con `?organization_id=`), ed è sempre lo stesso file da scaricare. */
  const route = path.split(/[?#]/)[0]
  const exact = exactImports[route as keyof typeof exactImports]
  if (exact) return exact
  return Object.entries(prefixImports).find(([prefix]) => route.startsWith(prefix))?.[1]
}

/**
 * Fa partire il file di una pagina prima che qualcuno ci entri.
 *
 * Lo chiamano le voci di navigazione e le tessere che portano a una pagina,
 * quando il puntatore ci passa sopra o quando prendono il fuoco da tastiera:
 * fra quel momento e il click c'è qualche decimo di secondo, che è quanto
 * basta perché il file arrivi e la pagina si apra senza attesa. Chi non ci
 * passa mai non scarica niente, che è il motivo per cui le pagine stanno a
 * parte.
 *
 * Un indirizzo che non è di questo elenco (il sito pubblico) non ha niente
 * da scaricare e non fa niente. Chiamarlo due volte sullo stesso indirizzo
 * nemmeno: un modulo già chiesto il browser non lo richiede, `import()`
 * restituisce la stessa promessa di prima.
 */
export function prefetchPage(path: string): void {
  const load = pageImportFor(path)
  if (load) void load()
}

/**
 * Le due manopole con cui un collegamento chiede il proprio precarico, da
 * mettere sul `Link`.
 *
 * Sono due perché ci si arriva in due modi: il puntatore che entra nel
 * collegamento, e il fuoco della tastiera che ci si posa. Stanno qui e non
 * ricopiate in ognuno dei posti in cui un collegamento si presenta, così una
 * sezione nuova precarica senza che nessuno se ne ricordi.
 */
export function prefetchOnHover(path: string) {
  return {
    onPointerEnter: () => prefetchPage(path),
    onFocus: () => prefetchPage(path),
  }
}
