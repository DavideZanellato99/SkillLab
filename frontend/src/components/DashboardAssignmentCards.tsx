import { useMemo, useState } from 'react'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { usePagination } from '../hooks/usePagination'
import type { PathAssignment, TrainingPath } from '../services/training'
import AssignmentCard from './AssignmentCard'
import { STATUS_META } from './assignmentStatus'
import EmptyState from './EmptyState'
import PaginationBar from './Pagination'
import SearchInput from './SearchInput'
import Select from './Select'
import { matchesSearch } from './tableSearch'
import { stepTarget } from './trainingFormat'

/* Chi sta percorrendo cosa, e a che punto è: una scheda per persona e
 * percorso.
 *
 * Sta nella dashboard e non più nella gestione percorsi: è una lettura, la
 * stessa domanda dei quattro numeri qui sopra fatta persona per persona, e
 * la gestione percorsi è dove si compone e si assegna. Per questo qui non si
 * ritira niente: il ritiro si fa dalla finestra di assegnazione della scheda
 * del percorso, che dice chi lo sta percorrendo e lo dice anche al contrario.
 *
 * Schede e non righe: era una tabella con due colonne di testo e una barra,
 * da leggere una cella alla volta, e la domanda di chi la guarda è visiva,
 * quanto manca a ognuno. La scheda lo dice con l'anello e i trattini (vedi
 * AssignmentCard), e tre schede per riga sono quello che entra su uno
 * schermo da scrivania senza che una scheda si allarghi a contenere spazio
 * vuoto. Si perde l'ordinamento per colonna; restano la ricerca, il filtro
 * per percorso e le pagine, come le schede dei percorsi nella gestione.
 *
 * La ricerca guarda anche il nome della tappa corrente e la parola dello
 * stato, che sono quelle che si leggono sulla scheda: chi cerca "scaduto" si
 * aspetta di trovare chi è in ritardo.
 *
 * Il filtro per percorso risponde alla domanda che si fa dopo aver
 * assegnato: non «dov'è Anna» ma «a che punto sono i dodici che stanno
 * facendo l'onboarding». Ci si arriva anche dalla scheda del percorso, dal
 * numero di chi lo sta percorrendo, che è dove quella domanda nasce. È una
 * tendina accanto alla ricerca, sopra la griglia: sono passate di qui anche
 * le pastiglie con il conteggio, il gruppo compatto dentro una fascia di
 * filtri e il selettore con ricerca, e la tendina è quella che è rimasta. */

export default function DashboardAssignmentCards({
  assignments,
  paths,
  pathFilter,
  onPathFilterChange,
  showOrganization,
  pageResetKey,
}: {
  assignments: PathAssignment[]
  /** I percorsi su cui si può restringere l'elenco, quelli dello scope. */
  paths: TrainingPath[]
  /** Il percorso su cui si sta guardando, vuoto per tutti quanti. */
  pathFilter: string
  onPathFilterChange: (pathId: string) => void
  showOrganization: boolean
  /** Cosa, fuori di qui, rende queste schede un elenco diverso. */
  pageResetKey: string
}) {
  /* La casella scrive subito, il filtro aspetta la fine della parola: le
   * assegnazioni di un tenant sono tutte qui, e riscorrerle a ogni tasto
   * premuto ridisegnava la griglia una volta per lettera. */
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)

  /* Il filtro per percorso lavora sulle schede già in mano e non su una
   * seconda chiamata: le assegnazioni dello scope sono già tutte qui, e
   * chiederle di nuovo al server per percorso vorrebbe dire aspettare una
   * risposta per un sottoinsieme di quello che si sta già guardando. */
  const filtered = useMemo(
    () =>
      assignments.filter((a) => {
        if (pathFilter && a.path_id !== pathFilter) return false
        const current = a.current_position ? a.steps[a.current_position - 1] : null
        return matchesSearch(
          debouncedSearch,
          a.user_name,
          a.user_email,
          a.path_title,
          showOrganization ? (a.organization_name ?? '') : '',
          current ? stepTarget(current) : '',
          STATUS_META[a.status].label,
        )
      }),
    [assignments, debouncedSearch, pathFilter, showOrganization],
  )

  /* La chiave dice cosa rende questo un elenco diverso: cambiata la domanda,
   * si torna alla prima pagina. */
  const { visible, bar } = usePagination(
    filtered,
    `${pageResetKey}|${pathFilter}|${debouncedSearch}`,
  )

  const filteredPath = paths.find((path) => path.id === pathFilter)

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Cerca per utente, percorso o stato..."
          ariaLabel="Cerca fra le persone in percorso"
          className="w-full max-w-[340px]"
        />
        {/* La tendina dei percorsi solo quando ce n'è più d'uno: con un
            percorso solo sarebbe un filtro che non toglie niente. Sta qui,
            accanto alla ricerca, e non in cima alla pagina con periodo e
            organizzazione, perché quelli valgono per tutta la sezione mentre
            questo parla delle sole schede qui sotto. */}
        {paths.length > 1 && (
          <Select
            id="assignments-path-filter"
            ariaLabel="Percorso"
            className="w-full max-w-[340px]"
            value={pathFilter}
            onChange={onPathFilterChange}
            options={[
              { value: '', label: 'Tutti i percorsi' },
              ...paths.map((path) => ({ value: path.id, label: path.title })),
            ]}
          />
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={
            debouncedSearch
              ? 'Nessun percorso corrisponde alla ricerca'
              : filteredPath
                ? `Nessuno sta percorrendo «${filteredPath.title}»`
                : 'Nessun percorso assegnato per la selezione corrente'
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {visible.map((a) => (
              <AssignmentCard key={a.id} assignment={a} showOrganization={showOrganization} />
            ))}
          </div>
          {/* La barra sta sotto la griglia e non dentro una scheda: qui non
              c'è un riquadro di cui essere il bordo basso. */}
          <PaginationBar {...bar} label="Persone" className="mt-1" />
        </>
      )}
    </>
  )
}
