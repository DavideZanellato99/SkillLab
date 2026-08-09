import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMyAssignments } from '../hooks/useTraining'
import AssignmentStatusBadge from './AssignmentStatusBadge'
import FormError from './FormError'
import LoadingState from './LoadingState'
import PathProgressRing from './PathProgressRing'
import PathStepDrawer from './PathStepDrawer'
import PathTrailMap from './PathTrailMap'
import { PageContainer } from './PageLayout'
import { ArrowLeftIcon } from './icons'
import { assignedByLabel } from './trainingFormat'

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
 * si fa scegliendo un nodo.
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
  const [chosenId, setChosenId] = useState<string | null>(null)

  const assignment = assignments.find((a) => a.id === assignmentId)

  const backLink = (
    <Link
      to="/app/percorsi"
      className="mb-6 inline-flex items-center gap-2 text-[0.82rem] font-medium text-slate-400 no-underline transition hover:text-slate-100"
    >
      <ArrowLeftIcon size={15} />
      Tutti i percorsi
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
        <p className="rounded-2xl border border-white/6 bg-gray-900/60 p-16 text-center text-slate-500 backdrop-blur-md">
          Questo percorso non è più fra i tuoi
        </p>
      </PageContainer>
    )
  }

  const steps = assignment.steps
  const selected = steps.find((step) => step.id === chosenId) ?? null

  /* Ricliccare la tappa aperta richiude il riquadro: il nodo è l'interruttore
     con cui lo si è acceso, e cercare il bottone di chiusura per tornare a
     guardare il sentiero sarebbe un giro in più per disfare un gesto solo. */
  const handleSelect = (stepId: string) => {
    setChosenId((current) => (current === stepId ? null : stepId))
  }

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

        {selected && (
          <PathStepDrawer step={selected} total={steps.length} onClose={() => setChosenId(null)} />
        )}
      </div>
    </PageContainer>
  )
}
