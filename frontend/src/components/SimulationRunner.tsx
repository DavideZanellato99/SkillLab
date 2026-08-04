import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useSimulation, useSubmitSimulation } from '../hooks/useSimulations'
import type { SimulationAnswerPayload, SimulationAttempt } from '../services/simulations'
import { PageContainer, PageHeader } from './PageLayout'
import LoadingState from './LoadingState'
import PrimaryButton from './PrimaryButton'
import FormError from './FormError'
import SimulationResult from './SimulationResult'
import SimulationIntro from './SimulationIntro'
import SimulationQuestionStep from './SimulationQuestionStep'
import { QUESTION_SECONDS } from './simulationFormat'

/* Lo svolgimento di un test e, alla fine, il suo esito.
 *
 * Il test è una domanda alla volta, con trenta secondi ciascuna: si risponde,
 * si passa alla successiva e non si torna più indietro. Nessun riscontro
 * durante il percorso, perché sapere di aver sbagliato la seconda mentre si
 * legge la terza cambia il modo di rispondere alle otto che restano: giusto e
 * sbagliato arrivano insieme, nel riepilogo finale.
 *
 * Le tre schermate sono una pagina sola e non tre indirizzi: le regole, le
 * domande, l'esito. Un id nuovo nell'indirizzo a metà test sarebbe un tasto
 * "indietro" del browser che rimette in gioco una domanda già consegnata.
 * Ricaricando si riparte dalle regole, e quello che si era già risposto è
 * perso: le risposte vivono qui finché non si consegna, perché un test a
 * metà non è un tentativo.
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
  const submit = useSubmitSimulation(simulationId ?? '')

  /** Il test è cominciato: da qui in poi il cronometro corre. */
  const [started, setStarted] = useState(false)
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

  const questions = simulation.questions
  const total = questions.length

  const send = (given: Record<string, SimulationAnswerPayload>) => {
    submit.mutate(
      /* Le domande mai arrivate a schermo, che ci sono solo se qualcosa è
       * andato storto, viaggiano in bianco e con tempo pieno: sono l'unica
       * cosa che il server non può ricostruire da solo. */
      questions.map(
        (q) =>
          given[q.id] ?? {
            question_id: q.id,
            selected_option: null,
            elapsed_ms: QUESTION_SECONDS * 1000,
          },
      ),
      {
        onSuccess: (attempt) => {
          setResult(attempt)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        },
      },
    )
  }

  /* Una domanda consegnata: si registra la risposta con il tempo che è
   * costata e si passa avanti, o si consegna il test se quella era
   * l'ultima. Le risposte di prima arrivano dallo stato, quella appena data
   * no: `send` riceve la mappa già completa perché lo stato aggiornato non è
   * leggibile nello stesso giro. */
  const handleAnswer = (choice: number | null, elapsedMs: number) => {
    const question = questions[index]
    const given = {
      ...answers,
      [question.id]: {
        question_id: question.id,
        selected_option: choice,
        elapsed_ms: elapsedMs,
      },
    }
    setAnswers(given)
    if (index + 1 < total) {
      setIndex(index + 1)
      // In cima subito e non con lo scorrimento morbido: la domanda nuova ha
      // già il suo cronometro che corre, e non deve arrivare da sotto.
      window.scrollTo({ top: 0 })
    } else send(given)
  }

  const restart = () => {
    setResult(null)
    setAnswers({})
    setIndex(0)
    setStarted(false)
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

  if (total === 0) {
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
            ? 'Rispondi entro il tempo, il riepilogo arriva alla fine.'
            : simulation.description || `${total} domande a risposta multipla, una alla volta.`
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
        <LoadingState message="Consegna del test in corso..." />
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
        /* La chiave rimonta il passo a ogni domanda, e con lui il cronometro:
           è il rimontaggio a rimettere a trenta i secondi, non un effetto. */
        <SimulationQuestionStep
          key={questions[index].id}
          question={questions[index]}
          number={index + 1}
          total={total}
          isLast={index + 1 === total}
          onAnswer={handleAnswer}
        />
      ) : (
        <SimulationIntro simulation={simulation} onStart={() => setStarted(true)} />
      )}
    </PageContainer>
  )
}
