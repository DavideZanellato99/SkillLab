import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router'
import { useAuth } from './hooks/useAuth'
import Navbar from './components/Navbar'
import Header from './components/Header'
import AvatarGallery from './components/AvatarGallery'
import ChatPage from './components/ChatPage'
import ComparisonPage from './components/ComparisonPage'
import MyPathsPage from './components/MyPathsPage'
import PathMapPage from './components/PathMapPage'
import SimulationsPage from './components/SimulationsPage'
import SimulationRunner from './components/SimulationRunner'
import ProfilePage from './components/ProfilePage'
import RequireRole from './components/RequireRole'
import LoadingState from './components/LoadingState'
import { mainContentCls, mainContentProps } from './components/mainContent'
import Spinner from './components/Spinner'
import './index.css'

/* Le schermate di amministrazione arrivano solo a chi ci entra.
 *
 * Sono otto pagine dense, ognuna con le sue tabelle e le sue modali, e un
 * import normale le avrebbe messe nel primo file che il browser scarica: chi
 * apre l'applicazione per fare una telefonata di prova si portava dietro
 * anche la gestione degli avatar e i log di audit, che non vedrà mai perché
 * il suo ruolo non glielo permette.
 *
 * Il confine è quello dei permessi e non una misura di comodo: sotto stanno
 * le rotte con `access="admin"` e `access="super_admin"`, sopra quelle che
 * chiunque sia collegato può aprire. Il ritardo che questo introduce lo paga
 * l'admin, una volta per sessione, entrando in una schermata che si apre già
 * aspettando dei dati. */
const AdminPage = lazy(() => import('./components/AdminPage'))
const OrganizationsPage = lazy(() => import('./components/OrganizationsPage'))
const DashboardPage = lazy(() => import('./components/DashboardPage'))
const TrainingPage = lazy(() => import('./components/TrainingPage'))
const UserReportPage = lazy(() => import('./components/UserReportPage'))
const AvatarAdminPage = lazy(() => import('./components/AvatarAdminPage'))
const SimulationAdminPage = lazy(() => import('./components/SimulationAdminPage'))
const AuditLogsPage = lazy(() => import('./components/AuditLogsPage'))

/* Il sito pubblico, per lo stesso motivo e dal lato opposto: è la pagina di
 * presentazione che chi ha la sessione aperta non vedrà mai più, e un import
 * normale l'avrebbe messa addosso a ogni accesso. Il confine è di nuovo
 * quello dei permessi, cioè l'essere o non essere collegati, e l'attesa la
 * paga il visitatore una volta sola. */
const PublicLayout = lazy(() => import('./components/public/PublicLayout'))
const PublicHome = lazy(() => import('./components/public/PublicHome'))

/* La galleria: la testata che presenta il catalogo, e il catalogo stesso.
 * Niente stato da tenere qui in mezzo, i due pezzi leggono gli stessi dati
 * dalla stessa cache. */
function HomePage() {
  return (
    <>
      <Header />
      <main
        {...mainContentProps}
        className={`${mainContentCls} mx-auto w-full max-w-[1400px] flex-1 px-6 pb-12 max-md:p-4`}
      >
        <AvatarGallery />
      </main>
    </>
  )
}

function App() {
  const { isAuthenticated, isLoading } = useAuth()

  // Show loading screen while auth state is initializing
  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col pt-16" id="app">
        <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-6">
          <Spinner />
          <p className="text-sm text-slate-500">Caricamento...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col pt-16" id="app">
      <Navbar />
      {/* Il tempo di scaricare una pagina di amministrazione: la stessa
          attesa che le pagine mostrano mentre chiedono i propri dati, così
          entrarci resta un gesto solo anche quando il file arriva ora. */}
      <Suspense fallback={<LoadingState message="Caricamento della pagina..." />}>
        <Routes>
          {isAuthenticated ? (
            /* Tutta l'applicazione collegata sta sotto `/app`, e nessuno dei
               suoi indirizzi coincide con una pagina del sito pubblico: il
               prefisso dice già, guardando la barra del browser, se per
               essere lì serve una sessione. Le due aree non si sono mai
               incontrate perché montano in rami diversi di questa condizione,
               ma condividevano `/` e `/simulatore`, e uno stesso indirizzo
               che porta a due pagine diverse è un link che non si può
               mandare a nessuno.

               Il vecchio percorso senza prefisso finisce nel catch all qui
               sotto, quindi un segnalibro salvato prima porta comunque
               dentro, alla home invece che al punto esatto. */
            <>
              <Route path="/app">
                {/* Every route states the role it needs: RequireRole is the
                    single place where access is decided, and its `access` prop
                    is mandatory, so a new route can't be added without one. */}
                <Route
                  index
                  element={
                    <RequireRole access="authenticated">
                      <HomePage />
                    </RequireRole>
                  }
                />
                <Route
                  path="chat/:avatarId"
                  element={
                    <RequireRole access="authenticated">
                      <ChatPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="profile"
                  element={
                    <RequireRole access="authenticated">
                      <ProfilePage />
                    </RequireRole>
                  }
                />
                {/* I propri percorsi: l'elenco, e il singolo come mappa.
                    Sono di chi si allena e di nessun altro: chi amministra
                    li compone e ne segue l'avanzamento dalla gestione
                    percorsi, e riceverne uno non è previsto, quindi qui
                    non ha niente da aprire. Il server dice lo stesso, con
                    un 403 su `/assignments/me`. */}
                <Route
                  path="percorsi"
                  element={
                    <RequireRole access="user">
                      <MyPathsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="percorsi/:assignmentId"
                  element={
                    <RequireRole access="user">
                      <PathMapPage />
                    </RequireRole>
                  }
                />
                {/* Ogni ruolo entra dalla stessa porta: lo studente ci trova i
                    propri tentativi, un admin il selettore delle persone del
                    proprio tenant. È il server a decidere di chi sono. */}
                <Route
                  path="confronto"
                  element={
                    <RequireRole access="authenticated">
                      <ComparisonPage />
                    </RequireRole>
                  }
                />
                {/* Il simulatore è di tutti: il server serve a ciascuno le
                    simulazioni della propria organizzazione, e al super admin
                    tutte. */}
                <Route
                  path="simulatore"
                  element={
                    <RequireRole access="authenticated">
                      <SimulationsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="simulatore/:simulationId"
                  element={
                    <RequireRole access="authenticated">
                      <SimulationRunner />
                    </RequireRole>
                  }
                />
                <Route
                  path="admin"
                  element={
                    <RequireRole access="super_admin">
                      <AdminPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="admin/organizations"
                  element={
                    <RequireRole access="super_admin">
                      <OrganizationsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="admin/dashboard"
                  element={
                    <RequireRole access="admin">
                      <DashboardPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="admin/training"
                  element={
                    <RequireRole access="admin">
                      <TrainingPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="admin/report"
                  element={
                    <RequireRole access="admin">
                      <UserReportPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="admin/avatars"
                  element={
                    <RequireRole access="super_admin">
                      <AvatarAdminPage />
                    </RequireRole>
                  }
                />
                {/* I test tecnici li scrive anche chi amministra una sola
                    organizzazione: è la stessa pagina, ed è il server a
                    confinarla al proprio tenant. */}
                <Route
                  path="admin/simulations"
                  element={
                    <RequireRole access="admin">
                      <SimulationAdminPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="admin/logs"
                  element={
                    <RequireRole access="super_admin">
                      <AuditLogsPage />
                    </RequireRole>
                  }
                />
              </Route>
              {/* Il catch all sta fuori da `/app` perché deve prendere anche
                  ciò che sta fuori: la pagina pubblica, che a sessione aperta
                  non esiste più, e gli indirizzi di prima del prefisso. */}
              <Route path="*" element={<Navigate to="/app" replace />} />
            </>
          ) : (
            /* Non autenticato: il sito pubblico, che è una pagina sola. I
               servizi si presentano lì in sintesi, perché chi apre la pagina
               valuta in pochi secondi se la piattaforma gli serve, e il
               dettaglio si vede entrando. Il footer, che è solo suo, sta nella
               rotta di impaginazione. */
            <Route element={<PublicLayout />}>
              <Route path="/" element={<PublicHome />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          )}
        </Routes>
      </Suspense>
    </div>
  )
}

export default App
