/* L'elenco dei test tecnici che si possono svolgere.
 *
 * È la galleria degli avatar con dentro dei test, fin nell'impaginazione: la
 * fascia che presenta la schermata e la conta ([SimulationsHeader](./SimulationsHeader.tsx))
 * sta sopra il `main`, e il `main` è quello delle gallerie
 * (`GalleryContainer`), con dentro la ricerca, le pastiglie e la griglia.
 * Sono le due schermate da cui si sceglie cosa fare adesso, si aprono dalla
 * stessa barra e si scorrono con la stessa domanda in testa: farle diverse
 * voleva dire impararle due volte. Quello che cambia è la materia, cioè cosa
 * c'è scritto sulle tessere e su cosa si restringe: là le categorie degli
 * avatar, qui i tipi di test, e in tutte e due la prima pastiglia è "Tutti".
 *
 * Nessun filtro per organizzazione: il server serve a ciascuno quelle del
 * proprio tenant, e al super admin tutte. Le simulazioni in bozza non
 * arrivano fin qui, stanno nella pagina di gestione.
 *
 * Di quale organizzazione sia il test lo legge solo il super admin, che è
 * l'unico ad avere davanti quelle di più tenant insieme. Chi appartiene a
 * un'organizzazione sola vedrebbe la stessa parola su ogni scheda, in una
 * riga che esiste per dire cosa distingue un test dall'altro.
 *
 * I test arrivano tutti in una lettura sola, quindi il restringere non torna
 * mai sul server (vedi `simulationFilters`), e un guasto di rete si racconta
 * in due modi: se non c'è niente a schermo la pagina lo dice e offre di
 * riprovare, se l'elenco è già lì da una lettura precedente basta un avviso
 * a scomparsa, perché quello che si vede resta buono. */

import { useEffect, useMemo, useState } from 'react'
import { useFlashMessage } from '../hooks/useFlashMessage'
import { useSimulations } from '../hooks/useSimulations'
import { useAuth } from '../hooks/useAuth'
import { isAdmin, isSuperAdmin } from '../services/auth'
import { GalleryContainer } from './PageLayout'
import FilterTabs from './FilterTabs'
import { galleryGridCls } from './galleryLayout'
import GallerySkeleton from './GallerySkeleton'
import LoadError from './LoadError'
import SearchInput from './SearchInput'
import SimulationCard from './SimulationCard'
import SimulationsEmpty, { type SimulationsEmptyReason } from './SimulationsEmpty'
import SimulationsHeader from './SimulationsHeader'
import StaleDataToast from './StaleDataToast'
import { ALL_KINDS, filterSimulations, kindFilterOptions } from './simulationFilters'
import type { SimulationFilter } from './simulationFilters'

export default function SimulationsPage() {
  const { user } = useAuth()
  const showOrganization = isSuperAdmin(user)
  const { data: simulations = [], isLoading, error, refetch } = useSimulations()

  const [filter, setFilter] = useState<SimulationFilter>(ALL_KINDS)
  const [search, setSearch] = useState('')

  const options = useMemo(() => kindFilterOptions(simulations), [simulations])
  const visible = useMemo(
    () => filterSimulations(simulations, filter, search),
    [simulations, filter, search],
  )

  /* L'elenco è già a schermo e il rinfresco è fallito: si dice, senza
   * togliere quello che si vede, che potrebbe non essere l'ultima parola. */
  const { message: staleWarning, flash, clear } = useFlashMessage()
  useEffect(() => {
    if (error && simulations.length > 0) {
      flash("L'elenco a schermo potrebbe non essere aggiornato.")
    }
  }, [error, simulations.length, flash])

  /* Perché non c'è niente da mostrare, in ordine di quanto è facile
   * rimediarci: la ricerca, poi il tipo scelto, e da ultimo l'elenco che è
   * vuoto davvero. */
  const emptyReason: SimulationsEmptyReason =
    search.trim() !== '' ? 'search' : filter !== ALL_KINDS ? 'filter' : 'catalog'

  return (
    <>
      <SimulationsHeader />
      <GalleryContainer>
        {/* La barra compare solo se c'è qualcosa da restringere: sopra un
            elenco vuoto sarebbe una casella di ricerca che non trova mai
            niente. */}
        {simulations.length > 0 && (
          <div className="mb-12 flex animate-fade-in-up flex-col items-center gap-4 [animation-delay:0.3s]">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Cerca per titolo, descrizione o tipo..."
              ariaLabel="Cerca un test tecnico"
              className="w-full max-w-md"
            />
            <FilterTabs
              value={filter}
              onChange={setFilter}
              options={options}
              ariaLabel="Tipo di test"
              variant="pills"
            />
          </div>
        )}

        {isLoading ? (
          <GallerySkeleton />
        ) : error && simulations.length === 0 ? (
          /* Niente a schermo e il server non risponde: non è un elenco vuoto,
             ed è l'unico caso in cui c'è qualcosa da riprovare. */
          <LoadError
            variant="page"
            message={
              error instanceof Error ? error.message : 'Errore nel caricamento delle simulazioni.'
            }
            onRetry={() => refetch()}
            className="animate-fade-in p-16 max-md:p-8"
          />
        ) : visible.length === 0 ? (
          <SimulationsEmpty
            reason={emptyReason}
            canManageSimulations={isAdmin(user)}
            onClearSearch={() => setSearch('')}
            onShowAll={() => setFilter(ALL_KINDS)}
          />
        ) : (
          <div className={galleryGridCls} id="simulation-grid">
            {visible.map((simulation, index) => (
              <SimulationCard
                key={simulation.id}
                simulation={simulation}
                index={index}
                showOrganization={showOrganization}
              />
            ))}
          </div>
        )}

        {staleWarning && <StaleDataToast message={staleWarning} onClose={clear} />}
      </GalleryContainer>
    </>
  )
}
