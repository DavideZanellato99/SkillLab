import { useEffect, useState } from 'react'
import {
  useAdminSimulation,
  useGenerateQuestions,
  useSaveQuestions,
  useSimulationResults,
  useUpdateSimulationStatus,
} from '../hooks/useSimulations'
import { QUESTION_COUNT } from '../services/simulations'
import type { SimulationQuestionPayload } from '../services/simulations'
import ModalShell from './ModalShell'
import LoadingState from './LoadingState'
import PrimaryButton from './PrimaryButton'
import Spinner from './Spinner'
import FormError from './FormError'
import FormSuccess from './FormSuccess'
import Badge from './Badge'
import SimulationQuestionEditor from './SimulationQuestionEditor'
import { formatDateTime, formatScore, scoreBadgeTone } from './simulationFormat'

/* Il pannello in cui una simulazione diventa un test: si generano le domande,
 * si rileggono, si correggono e si pubblica.
 *
 * Sta tutto in una modale perché è un gesto solo, con un ordine che non si
 * può saltare: la pubblicazione è in fondo, dopo le domande, e il bottone
 * dice quante ne mancano invece di limitarsi a essere spento.
 *
 * Le domande si modificano su una copia locale e si salvano in blocco. Chi
 * corregge un refuso in una spiegazione lo fa insieme al resto, e un salvataggio
 * per tasto premuto trasformerebbe una revisione in cinquanta scritture. */

const tabBtnCls =
  'cursor-pointer rounded-lg border-none bg-transparent px-3 py-1.5 text-[0.82rem] font-medium transition'

const secondaryBtnCls =
  'flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50'

function toPayload(
  questions: { text: string; options: string[]; correct_option: number; explanation: string }[],
): SimulationQuestionPayload[] {
  return questions.map((q) => ({
    text: q.text,
    options: [...q.options],
    correct_option: q.correct_option,
    explanation: q.explanation,
  }))
}

interface SimulationDetailModalProps {
  simulationId: string
  onClose: () => void
}

export default function SimulationDetailModal({
  simulationId,
  onClose,
}: SimulationDetailModalProps) {
  const { data: simulation, isLoading } = useAdminSimulation(simulationId)
  const generate = useGenerateQuestions(simulationId)
  const save = useSaveQuestions(simulationId)
  const setStatus = useUpdateSimulationStatus(simulationId)

  const [tab, setTab] = useState<'questions' | 'results'>('questions')
  const { data: results = [] } = useSimulationResults(simulationId, tab === 'results')

  const [draft, setDraft] = useState<SimulationQuestionPayload[]>([])
  const [saved, setSaved] = useState(false)

  /* La copia locale si riallinea a quella del server ogni volta che il server
   * ne manda una nuova: dopo una generazione le domande sono altre, e tenere
   * quelle di prima significherebbe mostrare un test che non esiste più. */
  useEffect(() => {
    if (simulation) setDraft(toPayload(simulation.questions))
  }, [simulation])

  const busy = generate.isPending || save.isPending || setStatus.isPending
  const isPublished = simulation?.status === 'published'
  const complete =
    draft.length === QUESTION_COUNT &&
    draft.every((q) => q.text.trim() && q.options.every((o) => o.trim()))

  /* Pubblicare salva prima le domande: quello che finisce davanti agli utenti
   * deve essere quello che il super admin sta guardando, non l'ultima
   * versione che era stata salvata prima delle correzioni di adesso. */
  const publish = () => {
    setSaved(false)
    save.mutate(draft, { onSuccess: () => setStatus.mutate('published') })
  }

  const error =
    (generate.error as Error | null)?.message ??
    (save.error as Error | null)?.message ??
    (setStatus.error as Error | null)?.message

  return (
    <ModalShell onClose={onClose} locked={busy} size="full" padding="none" layout="column">
      {isLoading || !simulation ? (
        <LoadingState message="Caricamento simulazione..." variant="modal" />
      ) : (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/6 px-8 py-5">
            <div className="min-w-0">
              <h2 className="font-heading text-xl font-bold text-slate-100">{simulation.title}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span>{simulation.organization_name}</span>
                <span aria-hidden>·</span>
                <span className="truncate">{simulation.document_name}</span>
                <span aria-hidden>·</span>
                <span>{simulation.chunk_count} passaggi indicizzati</span>
              </p>
            </div>
            <Badge
              tone={
                isPublished
                  ? 'border border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                  : 'border border-amber-500/25 bg-amber-500/10 text-amber-400'
              }
              className="mr-8 shrink-0"
            >
              {isPublished ? 'Pubblicata' : 'Bozza'}
            </Badge>
          </header>

          <div className="flex items-center gap-1 border-b border-white/6 px-8 py-2">
            <button
              className={`${tabBtnCls} ${tab === 'questions' ? 'bg-violet-600/12 text-slate-100' : 'text-slate-400 hover:bg-white/8 hover:text-slate-100'}`}
              onClick={() => setTab('questions')}
            >
              Domande ({draft.length})
            </button>
            <button
              className={`${tabBtnCls} ${tab === 'results' ? 'bg-violet-600/12 text-slate-100' : 'text-slate-400 hover:bg-white/8 hover:text-slate-100'}`}
              onClick={() => setTab('results')}
            >
              Risultati ({simulation.total_attempts})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-5">
            {tab === 'questions' ? (
              draft.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-16 text-center">
                  <p className="text-[0.95rem] text-slate-400">
                    Nessuna domanda ancora. Generale dal documento, poi rileggile prima di
                    pubblicare.
                  </p>
                  <p className="max-w-md text-sm text-slate-500">
                    La generazione legge il documento, individua gli argomenti verificabili e scrive
                    dieci domande sui passaggi che li riguardano. Può richiedere qualche minuto.
                  </p>
                </div>
              ) : (
                <ol className="flex list-none flex-col gap-3">
                  {draft.map((question, index) => (
                    <SimulationQuestionEditor
                      key={index}
                      index={index}
                      question={question}
                      disabled={busy}
                      onChange={(updated) =>
                        setDraft((prev) => prev.map((q, i) => (i === index ? updated : q)))
                      }
                    />
                  ))}
                </ol>
              )
            ) : results.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-500">
                Nessuno ha ancora svolto questo test.
              </p>
            ) : (
              <ul className="flex list-none flex-col gap-2">
                {results.map((attempt) => (
                  <li
                    key={attempt.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/6 bg-white/3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <span className="block truncate text-[0.9rem] text-slate-100">
                        {attempt.user_name}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {attempt.user_email}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">
                        {formatDateTime(attempt.created_at)}
                      </span>
                      <span className="text-xs tabular-nums text-slate-400">
                        {attempt.correct_count}/{attempt.question_count}
                      </span>
                      <Badge tone={scoreBadgeTone(attempt.score)}>
                        {formatScore(attempt.score)}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <footer className="flex flex-col gap-3 border-t border-white/6 px-8 py-4">
            {error && <FormError message={error} />}
            {saved && !error && <FormSuccess message="Domande salvate." />}

            {generate.isPending && (
              <p className="text-center text-xs text-slate-500">
                Il modello sta leggendo il documento e scrivendo le domande. Non chiudere questa
                finestra.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                className={secondaryBtnCls}
                onClick={() => {
                  setSaved(false)
                  generate.mutate()
                }}
                disabled={busy}
              >
                {generate.isPending ? (
                  <>
                    <Spinner variant="button" />
                    Generazione in corso...
                  </>
                ) : draft.length === 0 ? (
                  'Genera le domande'
                ) : (
                  'Rigenera dal documento'
                )}
              </button>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  className={secondaryBtnCls}
                  onClick={() => {
                    setSaved(false)
                    save.mutate(draft, { onSuccess: () => setSaved(true) })
                  }}
                  disabled={busy || draft.length === 0}
                >
                  {save.isPending ? (
                    <>
                      <Spinner variant="button" />
                      Salvataggio...
                    </>
                  ) : (
                    'Salva domande'
                  )}
                </button>

                {isPublished ? (
                  <button
                    className={secondaryBtnCls}
                    onClick={() => {
                      setSaved(false)
                      setStatus.mutate('draft')
                    }}
                    disabled={busy}
                  >
                    {setStatus.isPending ? (
                      <>
                        <Spinner variant="button" />
                        Ritiro...
                      </>
                    ) : (
                      'Ritira'
                    )}
                  </button>
                ) : (
                  <PrimaryButton onClick={publish} disabled={busy || !complete}>
                    {setStatus.isPending ? (
                      <>
                        <Spinner variant="button" />
                        Pubblicazione...
                      </>
                    ) : complete ? (
                      'Pubblica'
                    ) : (
                      `Servono ${QUESTION_COUNT} domande (ce ne sono ${draft.length})`
                    )}
                  </PrimaryButton>
                )}
              </div>
            </div>
          </footer>
        </>
      )}
    </ModalShell>
  )
}
