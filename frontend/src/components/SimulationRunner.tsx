import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useLeaveConfirmation } from '../hooks/useLeaveConfirmation'
import { useSimulation, useStartSimulation, useSubmitSimulation } from '../hooks/useSimulations'
import type {
  SimulationAnswerPayload,
  SimulationAttempt,
  SimulationPair,
  SimulationQuestion,
} from '../services/simulations'
import { PageContainer, PageHeader } from './PageLayout'
import EmptyState from './EmptyState'
import LoadError from './LoadError'
import LoadingState from './LoadingState'
import PrimaryButton from './PrimaryButton'
import { secondaryActionCls } from './SecondaryButton'
import FormError from './FormError'
import SimulationResult from './SimulationResult'
import PathStepNotice from './PathStepNotice'
import SimulationIntro from './SimulationIntro'
import SimulationQuestionStep from './SimulationQuestionStep'
import SimulationOpenQuestionStep from './SimulationOpenQuestionStep'
import SimulationOrderingStep from './SimulationOrderingStep'
import SimulationMatchingStep from './SimulationMatchingStep'
import SimulationProgress from './SimulationProgress'
import { isTimed, kindHint, QUESTION_SECONDS } from './simulationFormat'

/* Lo svolgimento di un test e, alla fine, il suo esito.
 *
 * Il test è una domanda alla volta: si risponde, si passa alla successiva e
 * non si torna più indietro. Nessun riscontro durante il percorso, perché
 * sapere di aver sbagliato la seconda mentre si legge la terza cambia il modo
 * di rispondere alle otto che restano: giusto e sbagliato arrivano insieme,
 * nel riepilogo finale.
 *
 * Come si risponde dipende dal tipo del test, e sono quattro passi diversi:
 * le alternative con il loro cronometro, una casella in cui scrivere,
 * dei passi da rimettere in fila, due colonne da accoppiare. Solo il primo ha
 * il cronometro. Questa pagina è la sola cosa che i quattro hanno in comune,
 * ed è per questo che sceglie qui invece di lasciare che un componente solo
 * faccia quattro cose a metà.
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

/* Il comando per uscire dal test, sempre lo stesso e sempre nello stesso
 * posto: a destra dell'intestazione, dove ogni schermata dell'applicazione
 * tiene la propria azione.
 *
 * Era scritto quattro volte con quattro collocazioni diverse, e siccome le
 * quattro sono stati della stessa pagina, il bottone si spostava sotto gli
 * occhi mentre si andava avanti: a destra del titolo mentre si leggevano le
 * regole, in mezzo alla pagina quando arrivava l'esito. Adesso l'unico stato
 * in cui non c'è è il test in corso, e non è una dimenticanza: da lì si esce
 * buttando via le risposte già date, e non deve capitare per sbaglio. */
function BackToList() {
  return (
    <Link to="/app/simulatore" className={secondaryActionCls}>
      Torna all'Elenco
    </Link>
  )
}

export default function SimulationRunner() {
  const { simulationId } = useParams<{ simulationId: string }>()
  const { data: simulation, isLoading, error, refetch } = useSimulation(simulationId)
  const start = useStartSimulation(simulationId ?? '')
  const submit = useSubmitSimulation(simulationId ?? '')

  /** Le domande estratte per questo tentativo: vuote finché non si comincia. */
  const [questions, setQuestions] = useState<SimulationQuestion[]>([])
  /** La domanda a schermo, contata da 0. */
  const [index, setIndex] = useState(0)
  /** question_id -> opzione scelta (null se in bianco) e tempo impiegato. */
  const [answers, setAnswers] = useState<Record<string, SimulationAnswerPayload>>({})
  const [result, setResult] = useState<SimulationAttempt | null>(null)

  /* Il test è cominciato e non è ancora consegnato: qui dentro ci sono le
   * domande estratte e le risposte già date, e nessuna delle due cose vive
   * altrove. Ricaricare per sbaglio le butta via, quindi si chiede conferma
   * prima. Sta prima delle uscite di sopra perché un hook si chiama sempre,
   * e con il test non cominciato la condizione è falsa e non fa niente. */
  useLeaveConfirmation(questions.length > 0 && result === null)

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingState message="Caricamento simulazione..." />
      </PageContainer>
    )
  }

  /* L'unico stato senza intestazione, perché senza la simulazione non c'è un
   * titolo da scriverci: qui il comando per uscire sta sotto il messaggio,
   * insieme a quello per riprovare la lettura, che è la coppia di cui una
   * pagina d'errore è fatta. Il riquadro rosso era scritto a mano, cioè una
   * copia di `LoadError` senza il suo comando: chi non trovava la simulazione
   * poteva solo tornare indietro, anche quando a mancare era solo la rete. */
  if (error || !simulation) {
    return (
      <PageContainer>
        <LoadError
          message={error instanceof Error ? error.message : 'Simulazione non trovata.'}
          variant="page"
          onRetry={() => void refetch()}
          className="py-8"
        />
        <div className="mt-4 flex justify-center">
          <BackToList />
        </div>
      </PageContainer>
    )
  }

  const total = questions.length
  const started = total > 0
  const kind = simulation.kind
  const isOpen = kind === 'open'
  const timed = isTimed(kind)

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
          (timed
            ? {
                question_id: q.id,
                selected_option: null,
                elapsed_ms: QUESTION_SECONDS * 1000,
              }
            : /* Senza cronometro basta il solo id: una voce senza nessuna
               * risposta è una domanda lasciata in bianco, che è quello che
               * una domanda mai comparsa è davvero. */
              { question_id: q.id }),
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

  /* Le risposte dei tre tipi senza cronometro: quello che ha scritto,
   * l'ordine in cui ha disposto i passi, le coppie che ha formato. Una sola
   * funzione perché cambia solo il campo che si riempie, e il resto (la
   * mappa di prima, il passaggio alla domanda dopo) è identico. */
  const handleGiven = (answer: Omit<SimulationAnswerPayload, 'question_id'>) => {
    const question = questions[index]
    handleAnswer({
      ...answers,
      [question.id]: { question_id: question.id, ...answer },
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
        <PageHeader
          title={simulation.title}
          description="Esito del test appena consegnato."
          actions={<BackToList />}
        />
        {/* Anche a test consegnato: da qui si torna al percorso, che è dove si
            vede se la tappa è stata superata e cosa viene dopo. */}
        <PathStepNotice kind="simulation" targetId={simulationId} className="mb-6" />
        <SimulationResult
          attempt={result}
          /* Solo il comando che riguarda questo riquadro: uscire è dell'intera
             schermata, e sta nella sua intestazione. */
          actions={<PrimaryButton onClick={restart}>Riprova il Test</PrimaryButton>}
        />
      </PageContainer>
    )
  }

  if (simulation.question_count === 0) {
    return (
      <PageContainer>
        <PageHeader
          title={simulation.title}
          description="Simulazione non ancora disponibile."
          actions={<BackToList />}
        />
        <EmptyState
          title="Questa simulazione non contiene ancora domande"
          hint="Sarà disponibile appena chi la gestisce le avrà predisposte"
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title={simulation.title}
        description={
          started
            ? timed
              ? 'Rispondi entro il tempo previsto, il riepilogo viene mostrato al termine.'
              : 'Prenditi il tempo necessario, il riepilogo viene mostrato al termine.'
            : simulation.description ||
              `${simulation.question_count} domande, una alla volta. ${kindHint(kind)}.`
        }
        /* Durante il test non c'è: uscire di lì butta via le domande estratte
           e le risposte già date. */
        actions={started ? undefined : <BackToList />}
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
            Le risposte non sono andate perse: ripeti la consegna.
          </p>
          <PrimaryButton onClick={() => send(answers)}>Riprova la Consegna</PrimaryButton>
        </>
      ) : started ? (
        <>
          {/* A che punto è il test: sta qui e non dentro il passo perché è del
              test e non della domanda, e perché nella scelta multipla dentro
              al riquadro ci sarebbe già la barra del tempo. Le domande
              consegnate sono quelle prima di questa. */}
          <SimulationProgress answered={index} total={total} />
          {/* La chiave rimonta il passo a ogni domanda, e con lui il cronometro
              o la casella: è il rimontaggio a rimettere a trenta i secondi e a
              svuotare quello che si era scritto, non un effetto. */}
          {(() => {
            /* La chiave sta fuori da questi campi e si scrive su ogni passo:
               è quella che rimonta il componente a ogni domanda, e React non
               la legge se arriva dentro uno spread. */
            const key = questions[index].id
            const step = {
              question: questions[index],
              number: index + 1,
              total,
              isLast: index + 1 === total,
            }
            if (kind === 'open') {
              return (
                <SimulationOpenQuestionStep
                  key={key}
                  {...step}
                  onAnswer={(answer_text: string | null) => handleGiven({ answer_text })}
                />
              )
            }
            if (kind === 'ordering') {
              return (
                <SimulationOrderingStep
                  key={key}
                  {...step}
                  onAnswer={(ordered_steps: string[] | null) => handleGiven({ ordered_steps })}
                />
              )
            }
            if (kind === 'matching') {
              return (
                <SimulationMatchingStep
                  key={key}
                  {...step}
                  onAnswer={(pairs: SimulationPair[] | null) => handleGiven({ pairs })}
                />
              )
            }
            return <SimulationQuestionStep key={key} {...step} onAnswer={handleChoice} />
          })()}
        </>
      ) : (
        <>
          {start.isError && (
            <FormError
              message={
                start.error instanceof Error
                  ? start.error.message
                  : 'Non è stato possibile avviare il test.'
              }
            />
          )}
          {/* Prima di cominciare, se questo test è la tappa di un percorso:
              il voto che serve va saputo mentre si leggono le regole, non
              cercato nella mappa da cui si è usciti. Non durante le domande,
              dove sarebbe una cosa in più da guardare a cronometro acceso. */}
          <PathStepNotice kind="simulation" targetId={simulationId} className="mb-6" />
          <SimulationIntro simulation={simulation} onStart={begin} starting={start.isPending} />
        </>
      )}
    </PageContainer>
  )
}
