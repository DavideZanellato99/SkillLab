import { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router'
import { useAuth } from './hooks/useAuth'
import Navbar from './components/Navbar'
import Header from './components/Header'
import AvatarGallery from './components/AvatarGallery'
import ChatPage from './components/ChatPage'
import ComparisonPage from './components/ComparisonPage'
import MyPathsRoute from './components/MyPathsRoute'
import PathMapPage from './components/PathMapPage'
import SimulationsPage from './components/SimulationsPage'
import SimulationRunner from './components/SimulationRunner'
import ProfilePage from './components/ProfilePage'
import RequireRole from './components/RequireRole'
import TutorialTour from './components/TutorialTour'
import LoadingState from './components/LoadingState'
import { GalleryContainer } from './components/PageLayout'
import {
  AdminPage,
  AuditLogsPage,
  AvatarAdminPage,
  DashboardPage,
  OrganizationsPage,
  PublicHome,
  PublicLayout,
  SimulationAdminPage,
  TrainingPage,
  UserReportPage,
} from './components/lazyPages'
import Spinner from './components/Spinner'
import './index.css'

/* Le pagine che arrivano solo a chi ci entra: le otto schermate di
 * amministrazione, e dal lato opposto il sito pubblico, che chi ha la
 * sessione aperta non vede più. Quali siano, e come la barra di navigazione
 * ne fa partire il file prima del click, sta in `lazyPages`.
 *
 * Il confine è quello dei permessi e non una misura di comodo: sotto stanno
 * le rotte con `access="admin"` e `access="super_admin"`, sopra quelle che
 * chiunque sia collegato può aprire. */

/* La galleria: la testata che presenta il catalogo, e il catalogo stesso.
 * Niente stato da tenere qui in mezzo, i due pezzi leggono gli stessi dati
 * dalla stessa cache. */
function HomePage() {
  return (
    <>
      <Header />
      <GalleryContainer>
        <AvatarGallery />
      </GalleryContainer>
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
      {/* La guida introduttiva, che al primo ingresso parte da sola. Sta
          qui e non dentro una pagina perché quello che indica è la barra,
          che è montata dappertutto: chi entra su un indirizzo salvato la
          riceve dove si trova, invece di doverla incontrare in home. Chi
          l'ha già vista, e il super admin che non la riceve mai, non
          disegnano niente. */}
      {isAuthenticated && <TutorialTour />}
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
                    un 403 su `/assignments/me`.

                    Con un percorso solo l'elenco sarebbe una riga sola:
                    MyPathsRoute lo salta e porta dritto alla mappa. */}
                <Route
                  path="percorsi"
                  element={
                    <RequireRole access="user">
                      <MyPathsRoute />
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
