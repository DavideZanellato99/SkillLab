import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMyAttempts, useSimulation, useSubmitSimulation } from '../hooks/useSimulations'
import type { SimulationAttempt } from '../services/simulations'
import { PageContainer, PageHeader } from './PageLayout'
import LoadingState from './LoadingState'
import PrimaryButton from './PrimaryButton'
import Spinner from './Spinner'
import FormError from './FormError'
import Badge from './Badge'
import SimulationResult from './SimulationResult'
import ConfirmModal from './ConfirmModal'
import { formatDateTime, formatScore, optionLabel, scoreBadgeTone } from './simulationFormat'

/* Lo svolgimento di un test e, subito dopo la consegna, il suo esito.
 *
 * Una schermata sola per le due cose perché sono lo stesso momento: si
 * consegna e si vede com'è andata, senza cambiare pagina e senza un id nuovo
 * nell'indirizzo. Ricaricando si riparte dal test, ed è giusto: l'esito
 * appena letto resta negli ultimi tentativi.
 *
 * Nessun cronometro e nessun blocco: si può tornare indietro su una domanda
 * fino alla consegna. Il test verifica se la procedura è nota, non se la si
 * ricorda sotto pressione, e per quello c'è il roleplay. */

const linkBtnCls =
  'flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/6 bg-white/4 px-6 py-2 text-sm font-medium text-slate-400 no-underline transition hover:bg-white/8 hover:text-slate-100'

export default function SimulationRunner() {
  const { simulationId } = useParams<{ simulationId: string }>()
  const { data: simulation, isLoading, error } = useSimulation(simulationId)
  const { data: attempts = [] } = useMyAttempts(simulationId)
  const submit = useSubmitSimulation(simulationId ?? '')

  /** question_id -> indice dell'opzione scelta. */
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<SimulationAttempt | null>(null)
  const [confirmIncomplete, setConfirmIncomplete] = useState(false)

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingState message="Caricamento simulazione..." />
      </PageContainer>
    )
  }

  if (error || !simulation) {
    return (
      <PageContainer>
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-6 text-center text-[0.9rem] text-red-300">
          {error instanceof Error ? error.message : 'Simulazione non trovata.'}
        </div>
        <Link to="/simulatore" className={`${linkBtnCls} mx-auto mt-6 w-fit`}>
          Torna all'elenco
        </Link>
      </PageContainer>
    )
  }

  const answered = simulation.questions.filter((q) => answers[q.id] !== undefined).length
  const total = simulation.questions.length
  const allAnswered = answered === total

  const send = () => {
    setConfirmIncomplete(false)
    submit.mutate(
      simulation.questions.map((q) => ({
        question_id: q.id,
        selected_option: answers[q.id] ?? null,
      })),
      {
        onSuccess: (attempt) => {
          setResult(attempt)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        },
      },
    )
  }

  const retry = () => {
    setResult(null)
    setAnswers({})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (result) {
    return (
      <PageContainer>
        <PageHeader title={simulation.title} description="Esito del test appena consegnato." />
        <SimulationResult
          attempt={result}
          actions={
            <>
              <PrimaryButton onClick={retry}>Riprova il test</PrimaryButton>
              <Link to="/simulatore" className={linkBtnCls}>
                Torna all'elenco
              </Link>
            </>
          }
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title={simulation.title}
        description={simulation.description || `${total} domande a risposta multipla.`}
        actions={
          <Link to="/simulatore" className={linkBtnCls}>
            Torna all'elenco
          </Link>
        }
      />

      {attempts.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/6 bg-gray-900/60 px-5 py-3 backdrop-blur-md">
          <span className="text-xs font-medium tracking-wide text-slate-400">
            Tentativi passati
          </span>
          {attempts.slice(0, 5).map((attempt) => (
            <span key={attempt.id} className="flex items-center gap-1.5 text-xs text-slate-500">
              <Badge tone={scoreBadgeTone(attempt.score)}>{formatScore(attempt.score)}</Badge>
              {formatDateTime(attempt.created_at)}
            </span>
          ))}
        </div>
      )}

      <ol className="mb-6 flex list-none flex-col gap-4">
        {simulation.questions.map((question) => (
          <li
            key={question.id}
            className="rounded-2xl border border-white/6 bg-gray-900/60 p-5 backdrop-blur-md"
          >
            <fieldset>
              <legend className="mb-3 text-[0.95rem] font-medium leading-relaxed text-slate-100">
                <span className="mr-1 text-slate-500">{question.position}.</span>
                {question.text}
              </legend>
              <div className="flex flex-col gap-1.5">
                {question.options.map((option, index) => {
                  const selected = answers[question.id] === index
                  return (
                    <label
                      key={index}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-2.5 text-[0.9rem] transition ${
                        selected
                          ? 'border-violet-600 bg-violet-600/12 text-slate-100'
                          : 'border-white/6 bg-white/2 text-slate-400 hover:border-white/12 hover:bg-white/5'
                      }`}
                    >
                      <input
                        type="radio"
                        name={question.id}
                        checked={selected}
                        onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: index }))}
                        className="sr-only"
                      />
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.7rem] font-bold ${
                          selected
                            ? 'border-violet-600 bg-violet-600 text-white'
                            : 'border-white/15 text-slate-500'
                        }`}
                        aria-hidden
                      >
                        {optionLabel(index)}
                      </span>
                      <span className="flex-1 leading-relaxed">{option}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>

      {submit.isError && (
        <FormError
          message={
            submit.error instanceof Error ? submit.error.message : 'Errore nella consegna del test.'
          }
        />
      )}

      {/* La barra della consegna resta a portata di pollice mentre si scorre:
          con dieci domande il fondo pagina è lontano, e chi ha finito non
          deve andarselo a cercare. */}
      <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/6 bg-gray-900/90 px-5 py-4 backdrop-blur-xl">
        <span className="text-[0.85rem] text-slate-400">
          Hai risposto a <span className="font-semibold text-slate-100">{answered}</span> domande su{' '}
          {total}
        </span>
        <PrimaryButton
          onClick={() => (allAnswered ? send() : setConfirmIncomplete(true))}
          disabled={submit.isPending}
        >
          {submit.isPending ? (
            <>
              <Spinner variant="button" />
              Consegna in corso...
            </>
          ) : (
            'Consegna il test'
          )}
        </PrimaryButton>
      </div>

      {confirmIncomplete && (
        <ConfirmModal
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          }
          iconWrapperCls="border border-amber-500/25 bg-amber-500/10 text-amber-400"
          title="Test incompleto"
          description={
            <>
              Hai lasciato in bianco {total - answered}{' '}
              {total - answered === 1 ? 'domanda' : 'domande'}. Le domande senza risposta contano
              come sbagliate. Vuoi consegnare lo stesso?
            </>
          }
          confirmLabel="Consegna"
          pendingLabel="Consegna in corso..."
          confirmClassName="bg-gradient-to-br from-violet-600 to-cyan-500 text-white"
          isPending={submit.isPending}
          onConfirm={send}
          onClose={() => setConfirmIncomplete(false)}
        />
      )}
    </PageContainer>
  )
}
