import { useCallback } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useMyAssignments } from '../hooks/useTraining'
import type { StepProgress } from '../services/training'
import AssignmentStatusBadge from './AssignmentStatusBadge'
import EmptyState from './EmptyState'
import FormError from './FormError'
import LoadingState from './LoadingState'
import PathProgressRing from './PathProgressRing'
import PathStepDrawer from './PathStepDrawer'
import PathTrailMap from './PathTrailMap'
import { PageContainer } from './PageLayout'
import { primaryActionCls } from './PrimaryButton'
import { ArrowLeftIcon } from './icons'
import { assignedByLabel, resumableStep, stepLink, stepTarget } from './trainingFormat'

/* Un percorso come mappa: il sentiero largo quanto la pagina, e la tappa
 * scelta che si apre di lato sopra di lui (vedi PathStepDrawer).
 *
 * L'assegnazione arriva dalla stessa lista che riempie l'elenco e il
 * riepilogo in home, cercata per id: sono i propri percorsi, cioè una manciata
 * di righe che il server manda già complete di progresso, e una rotta apposta
 * per leggerne una avrebbe voluto dire una seconda risposta da tenere
 * d'accordo con la prima.
 *
 * **La pagina si apre sulla sola mappa**, senza nessuna tappa scelta: la
 * domanda con cui la si apre è dove si è arrivati, e a quella il sentiero
 * risponde da solo, con la luce che si ferma e l'alone attorno alla tappa di
 * adesso. Il dettaglio di una tappa è una seconda domanda, e arriva quando la
 * si fa scegliendo un nodo, oppure già scritta nell'indirizzo se si è entrati
 * da un collegamento che la nomina.
 *
 * Aprendo il riquadro la mappa gli fa posto invece di sparirci sotto: il
 * sentiero si scosta dal centro fin quasi al bordo, e un pannello appoggiato
 * lì coprirebbe le tappe che stanno a destra, cioè metà di quelle che si
 * vogliono guardare mentre si legge. Le posizioni sono percentuali della
 * larghezza (vedi pathMapLayout), quindi restringere il riquadro della mappa
 * ricompone il sentiero invece di tagliarlo. */

export default function PathMapPage() {
  const { assignmentId } = useParams()
  const { data: assignments = [], isPending, error } = useMyAssignments()

  /* Quale tappa è aperta sta nell'indirizzo, come `?tappa=<numero>`: è la
     seconda cosa che questa pagina mostra, e tenuta in uno stato locale
     spariva a ogni ricarica e non si poteva mandare a nessuno. Il numero e non
     l'id perché è quello che si legge sul nodo, quindi un indirizzo copiato
     dice già di cosa parla.
     La prima apertura aggiunge un passo alla cronologia e il resto lo
     sostituisce: così "indietro" chiude il riquadro invece di uscire dalla
     mappa, ma dieci nodi guardati di fila non diventano dieci passi da
     rifare all'indietro per tornare all'elenco. */
  const [searchParams, setSearchParams] = useSearchParams()
  const chosen = searchParams.get('tappa')

  /* Ricliccare la tappa aperta richiude il riquadro: il nodo è l'interruttore
     con cui lo si è acceso, e cercare il bottone di chiusura per tornare a
     guardare il sentiero sarebbe un giro in più per disfare un gesto solo. */
  const showStep = useCallback(
    (position: number | null) => {
      const wasOpen = searchParams.get('tappa')
      const next = new URLSearchParams(searchParams)
      if (position === null || String(position) === wasOpen) next.delete('tappa')
      else next.set('tappa', String(position))
      setSearchParams(next, { replace: wasOpen !== null })
    },
    [searchParams, setSearchParams],
  )
  const handleSelect = useCallback((step: StepProgress) => showStep(step.position), [showStep])
  const closePanel = useCallback(() => showStep(null), [showStep])

  const assignment = assignments.find((a) => a.id === assignmentId)

  /* Il ritorno all'elenco sparisce quando l'elenco è questa pagina e basta:
     con un percorso solo la sezione ci entra dritta, e il collegamento
     rimbalzerebbe qui senza che si veda succedere niente. Resta invece
     quando il percorso non si trova, perché lì è l'unica via d'uscita da
     un indirizzo scaduto. */
  const soloPercorso = assignments.length === 1 && Boolean(assignment)

  const backLink = soloPercorso ? null : (
    <Link
      to="/app/percorsi"
      className="mb-6 inline-flex items-center gap-2 text-[0.82rem] font-medium text-slate-400 no-underline transition hover:text-slate-100"
    >
      <ArrowLeftIcon size={15} />
      Tutti i Percorsi
    </Link>
  )

  if (isPending) {
    return (
      <PageContainer>
        <LoadingState message="Caricamento del percorso..." />
      </PageContainer>
    )
  }

  if (error) {
    return (
      <PageContainer>
        {backLink}
        <FormError
          message={error instanceof Error ? error.message : 'Impossibile caricare il percorso.'}
        />
      </PageContainer>
    )
  }

  if (!assignment) {
    return (
      <PageContainer>
        {backLink}
        <EmptyState title="Questo percorso non è più fra i tuoi" />
      </PageContainer>
    )
  }

  const steps = assignment.steps
  const selected = steps.find((step) => String(step.position) === chosen) ?? null
  const resume = resumableStep(assignment)

  return (
    <PageContainer>
      {backLink}

      <header className="mb-8 flex flex-wrap items-center gap-4">
        <PathProgressRing done={assignment.completed_steps} total={steps.length} size={64} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-3xl font-bold text-slate-100">
              {assignment.path_title}
            </h1>
            <AssignmentStatusBadge status={assignment.status} />
          </div>
          <p className="text-[0.95rem] text-slate-500">
            {assignment.path_description ?? (
              <>
                {assignment.completed_steps} di {steps.length}{' '}
                {steps.length === 1 ? 'tappa superata' : 'tappe superate'}
              </>
            )}
          </p>
          {/* La stessa firma dell'elenco, perché a questa pagina si arriva
              anche dalla notifica, senza passare da lì. */}
          <p className="mt-1 text-[0.78rem] text-slate-600">{assignedByLabel(assignment)}</p>
        </div>
        {/* La prova della tappa di adesso, senza passare dal riquadro: aprire
            la mappa e volerci entrare sono due gesti che si fanno di seguito,
            e il secondo stava dietro a un nodo da trovare sul sentiero. Il
            riquadro resta per tutto il resto, cioè l'obiettivo, le prove fatte
            e le tappe che non sono il proprio turno. */}
        {resume && (
          <Link
            to={stepLink(resume)}
            className={primaryActionCls}
            aria-label={`Riprendi dalla tappa ${resume.position}, ${stepTarget(resume)}`}
          >
            Riprendi la tappa {resume.position}
          </Link>
        )}
      </header>

      <div className="relative">
        {/* Il sentiero, dentro una tela sua: le macchie di luce dietro sono
            lentissime e non ci si guarda, servono a far sembrare la mappa un
            posto invece di un elenco disposto a onda. */}
        <div
          className={`relative overflow-hidden rounded-3xl border border-white/6 bg-gradient-to-b from-gray-900/70 to-gray-900/20 px-6 py-4 backdrop-blur-md transition-[padding] duration-500 ${
            /* L'altezza minima è per i percorsi di due o tre tappe: la tela
               starebbe in poco più di duecento pixel, e il riquadro appoggiato
               dentro finirebbe a scorrere su sé stesso pur avendo mezzo
               schermo vuoto sotto. */
            selected ? 'lg:min-h-[540px] lg:pr-[396px]' : ''
          }`}
        >
          <span
            className="pointer-events-none absolute -left-24 top-0 h-72 w-72 animate-aurora rounded-full bg-violet-600/12 blur-3xl"
            aria-hidden="true"
          />
          <span
            className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 animate-aurora rounded-full bg-cyan-500/10 blur-3xl [animation-delay:-8s]"
            aria-hidden="true"
          />
          <div className="relative">
            <PathTrailMap
              steps={steps}
              completedSteps={assignment.completed_steps}
              selectedId={selected?.id ?? ''}
              onSelect={handleSelect}
            />
          </div>
        </div>

        {selected && <PathStepDrawer step={selected} total={steps.length} onClose={closePanel} />}
      </div>
    </PageContainer>
  )
}
