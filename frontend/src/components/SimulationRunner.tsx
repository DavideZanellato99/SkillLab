import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useSimulation, useStartSimulation, useSubmitSimulation } from '../hooks/useSimulations'
import type {
  SimulationAnswerPayload,
  SimulationAttempt,
  SimulationQuestion,
} from '../services/simulations'
import { PageContainer, PageHeader } from './PageLayout'
import LoadingState from './LoadingState'
import PrimaryButton from './PrimaryButton'
import FormError from './FormError'
import SimulationResult from './SimulationResult'
import SimulationIntro from './SimulationIntro'
import SimulationQuestionStep from './SimulationQuestionStep'
import SimulationOpenQuestionStep from './SimulationOpenQuestionStep'
import { QUESTION_SECONDS } from './simulationFormat'

/* Lo svolgimento di un test e, alla fine, il suo esito.
 *
 * Il test è una domanda alla volta: si risponde, si passa alla successiva e
 * non si torna più indietro. Nessun riscontro durante il percorso, perché
 * sapere di aver sbagliato la seconda mentre si legge la terza cambia il modo
 * di rispondere alle otto che restano: giusto e sbagliato arrivano insieme,
 * nel riepilogo finale.
 *
 * Come si risponde dipende dal tipo del test, e sono due passi diversi:
 * le alternative con trenta secondi ciascuna, oppure una casella in cui
 * scrivere senza cronometro. Questa pagina è la sola cosa che i due hanno in
 * comune, ed è per questo che sceglie qui invece di lasciare che un
 * componente solo faccia entrambe le cose a metà.
 *
 * Le tre schermate sono una pagina sola e non tre indirizzi: le regole, le
 * domande, l'esito. Un id nuovo nell'indirizzo a metà test sarebbe un tasto
 * "indietro" del browser che rimette in gioco una domanda già consegnata.
 * Ricaricando si riparte dalle regole, e quello che si era già risposto è
 * perso: le risposte vivono qui finché non si consegna, perché un test a
 * metà non è un tentativo.
 *
 * Le domande arrivano premendo "inizia" e non aprendo la pagina: il server ne
 * estrae dieci a caso dal serbatoio di quel documento, e sono diverse a ogni
 * tentativo. Vivono in questo stato e da nessun'altra parte, nemmeno nella
 * cache di TanStack Query, perché sono l'esito di un'estrazione e non un dato
 * da riprendere: ricaricare la pagina a metà test butta via quelle domande e
 * ne fa estrarre altre, che è la stessa regola delle risposte perse.
 *
 * Le risposte si consegnano da sole quando finisce l'ultima domanda, quindi
 * questa è l'unica pagina in cui una chiamata fallita non lascia niente da
 * ritentare a mano: l'errore resta a schermo con le risposte ancora in mano e
 * il pulsante per riprovare la consegna. */

const linkBtnCls =
  'flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/6 bg-white/4 px-6 py-2 text-sm font-medium text-slate-400 no-underline transition hover:bg-white/8 hover:text-slate-100'

export default function SimulationRunner() {
  const { simulationId } = useParams<{ simulationId: string }>()
  const { data: simulation, isLoading, error } = useSimulation(simulationId)
  const start = useStartSimulation(simulationId ?? '')
  const submit = useSubmitSimulation(simulationId ?? '')

  /** Le domande estratte per questo tentativo: vuote finché non si comincia. */
  const [questions, setQuestions] = useState<SimulationQuestion[]>([])
  /** La domanda a schermo, contata da 0. */
  const [index, setIndex] = useState(0)
  /** question_id -> opzione scelta (null se in bianco) e tempo impiegato. */
  const [answers, setAnswers] = useState<Record<string, SimulationAnswerPayload>>({})
  const [result, setResult] = useState<SimulationAttempt | null>(null)

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

  const total = questions.length
  const started = total > 0
  const isOpen = simulation.kind === 'open'

  /* Comincia il test: le domande le estrae il server adesso. Finché non
   * arrivano si resta sulle regole con il pulsante che gira, perché una
   * schermata vuota in mezzo farebbe sembrare partito un test che non è
   * ancora cominciato. */
  const begin = () => {
    start.mutate(undefined, {
      onSuccess: (drawn) => {
        setQuestions(drawn)
        window.scrollTo({ top: 0 })
      },
    })
  }

  const send = (given: Record<string, SimulationAnswerPayload>) => {
    submit.mutate(
      /* Le domande mai arrivate a schermo, che ci sono solo se qualcosa è
       * andato storto, viaggiano in bianco e con tempo pieno: sono l'unica
       * cosa che il server non può ricostruire da solo. */
      questions.map(
        (q) =>
          given[q.id] ??
          (isOpen
            ? { question_id: q.id, answer_text: null }
            : {
                question_id: q.id,
                selected_option: null,
                elapsed_ms: QUESTION_SECONDS * 1000,
              }),
      ),
      {
        onSuccess: (attempt) => {
          setResult(attempt)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        },
      },
    )
  }

  /* Una domanda consegnata: si registra la risposta e si passa avanti, o si
   * consegna il test se quella era l'ultima. Le risposte di prima arrivano
   * dallo stato, quella appena data no: `send` riceve la mappa già completa
   * perché lo stato aggiornato non è leggibile nello stesso giro. */
  const handleAnswer = (given: Record<string, SimulationAnswerPayload>) => {
    setAnswers(given)
    if (index + 1 < total) {
      setIndex(index + 1)
      // In cima subito e non con lo scorrimento morbido: la domanda nuova ha
      // già il suo cronometro che corre, e non deve arrivare da sotto.
      window.scrollTo({ top: 0 })
    } else send(given)
  }

  /** Una scelta e il tempo che è costata, sui test a scelta multipla. */
  const handleChoice = (choice: number | null, elapsedMs: number) => {
    const question = questions[index]
    handleAnswer({
      ...answers,
      [question.id]: { question_id: question.id, selected_option: choice, elapsed_ms: elapsedMs },
    })
  }

  /** Quello che ha scritto, sui test a risposta aperta. */
  const handleWritten = (text: string | null) => {
    const question = questions[index]
    handleAnswer({
      ...answers,
      [question.id]: { question_id: question.id, answer_text: text },
    })
  }

  /* Riprovare il test torna alle regole con le mani vuote: le domande di
   * prima si buttano, perché il tentativo nuovo ne avrà altre estratte
   * quando lo si comincerà. */
  const restart = () => {
    setResult(null)
    setAnswers({})
    setIndex(0)
    setQuestions([])
    start.reset()
    submit.reset()
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
              <PrimaryButton onClick={restart}>Riprova il test</PrimaryButton>
              <Link to="/simulatore" className={linkBtnCls}>
                Torna all'elenco
              </Link>
            </>
          }
        />
      </PageContainer>
    )
  }

  if (simulation.question_count === 0) {
    return (
      <PageContainer>
        <PageHeader title={simulation.title} description="Simulazione non ancora svolgibile." />
        <div className="rounded-2xl border border-white/6 bg-gray-900/60 p-16 text-center text-slate-500 backdrop-blur-md">
          <p className="mb-1 text-[0.95rem]">Questa simulazione non ha ancora domande</p>
          <p className="text-sm">Sarà svolgibile appena chi la gestisce le avrà preparate</p>
        </div>
        <Link to="/simulatore" className={`${linkBtnCls} mx-auto mt-6 w-fit`}>
          Torna all'elenco
        </Link>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title={simulation.title}
        description={
          started
            ? isOpen
              ? 'Rispondi con parole tue, il riepilogo arriva alla fine.'
              : 'Rispondi entro il tempo, il riepilogo arriva alla fine.'
            : simulation.description ||
              `${simulation.question_count} domande ${isOpen ? 'a risposta aperta' : 'a risposta multipla'}, una alla volta.`
        }
        actions={
          started ? undefined : (
            <Link to="/simulatore" className={linkBtnCls}>
              Torna all'elenco
            </Link>
          )
        }
      />

      {submit.isPending ? (
        /* Su un test a risposta aperta la consegna aspetta il modello che
           legge tutte le risposte, quindi qui si sta qualche secondo e non
           un istante: l'attesa va detta, o sembra che si sia inceppato. */
        <LoadingState
          message={
            isOpen ? 'Correzione delle risposte in corso...' : 'Consegna del test in corso...'
          }
        />
      ) : submit.isError ? (
        <>
          <FormError
            message={
              submit.error instanceof Error
                ? submit.error.message
                : 'Errore nella consegna del test.'
            }
          />
          <p className="mb-4 text-[0.85rem] text-slate-400">
            Le tue risposte non sono andate perse: riprova la consegna.
          </p>
          <PrimaryButton onClick={() => send(answers)}>Riprova la consegna</PrimaryButton>
        </>
      ) : started ? (
        /* La chiave rimonta il passo a ogni domanda, e con lui il cronometro
           o la casella: è il rimontaggio a rimettere a trenta i secondi e a
           svuotare quello che si era scritto, non un effetto. */
        isOpen ? (
          <SimulationOpenQuestionStep
            key={questions[index].id}
            question={questions[index]}
            number={index + 1}
            total={total}
            isLast={index + 1 === total}
            onAnswer={handleWritten}
          />
        ) : (
          <SimulationQuestionStep
            key={questions[index].id}
            question={questions[index]}
            number={index + 1}
            total={total}
            isLast={index + 1 === total}
            onAnswer={handleChoice}
          />
        )
      ) : (
        <>
          {start.isError && (
            <FormError
              message={
                start.error instanceof Error
                  ? start.error.message
                  : 'Non è stato possibile cominciare il test.'
              }
            />
          )}
          <SimulationIntro simulation={simulation} onStart={begin} starting={start.isPending} />
        </>
      )}
    </PageContainer>
  )
}
