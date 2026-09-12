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
import SimulationProgress, { type ProgressMark } from './SimulationProgress'
import { isTimed, kindHint, QUESTION_SECONDS } from './simulationFormat'

/* Lo svolgimento di un test e, alla fine, il suo esito.
 *
 * Il test è una domanda alla volta. Nessun riscontro durante il percorso,
 * perché sapere di aver sbagliato la seconda mentre si legge la terza cambia
 * il modo di rispondere alle otto che restano: giusto e sbagliato arrivano
 * insieme, nel riepilogo finale.
 *
 * Come si risponde dipende dal tipo del test, e sono quattro passi diversi:
 * le alternative con il loro cronometro, una casella in cui scrivere,
 * dei passi da rimettere in fila, due colonne da accoppiare. Solo il primo ha
 * il cronometro. Questa pagina è la sola cosa che i quattro hanno in comune,
 * ed è per questo che sceglie qui invece di lasciare che un componente solo
 * faccia quattro cose a metà.
 *
 * Il cronometro decide anche se si torna indietro. Sulla scelta multipla no:
 * una domanda consegnata ha il suo tempo misurato, e riaprirla vorrebbe dire
 * misurarlo di nuovo. Sugli altri tre il tempo non conta, quindi fino alla
 * consegna si può tornare su qualsiasi domanda già vista, con il pulsante
 * "Indietro" del passo o premendo il suo trattino nella barra in cima, e
 * cambiare la risposta. Per questo i tre passi senza cronometro comunicano la
 * risposta a ogni modifica e non solo quando si va avanti: la barra sta fuori
 * dal passo, e chi lascia la domanda da lì non passa dal pulsante. Tornando,
 * il passo si rimonta con quello che si era lasciato.
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
  /* Fin dove il test è arrivato: l'indice più alto mai comparso. Tornando
   * indietro `index` scende e questo no, ed è il confine di dove si può
   * andare dalla barra: una domanda mai comparsa arriva quando è il suo
   * turno, non prima. */
  const [reached, setReached] = useState(0)
  /** question_id -> la risposta com'è adesso, nella forma in cui si consegna. */
  const [answers, setAnswers] = useState<Record<string, SimulationAnswerPayload>>({})
  /* Sull'ordinamento, la sequenza com'è rimasta anche se incompleta: la
   * risposta di sopra a metà è null, e chi torna su una domanda lasciata a
   * metà deve ritrovarla a metà, non vuota. */
  const [sequences, setSequences] = useState<Record<string, (string | null)[]>>({})
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

  /* Una domanda lasciata in bianco, nella forma del suo tipo. Sulla scelta
   * multipla è una domanda mai arrivata a schermo, che c'è solo se qualcosa
   * è andato storto, e viaggia con tempo pieno: è l'unica cosa che il server
   * non può ricostruire da solo. Sugli altri tipi è la domanda che si è
   * saltata senza toccare niente, cioè la normalità: il passo comunica solo
   * quando qualcosa cambia, e in bianco non è cambiato niente. Il server
   * legge allo stesso modo il campo a null e il campo assente, ma un corpo
   * in cui ogni risposta ha la stessa forma si legge meglio. */
  const blank = (q: SimulationQuestion): SimulationAnswerPayload =>
    timed
      ? { question_id: q.id, selected_option: null, elapsed_ms: QUESTION_SECONDS * 1000 }
      : kind === 'open'
        ? { question_id: q.id, answer_text: null }
        : kind === 'ordering'
          ? { question_id: q.id, ordered_steps: null }
          : { question_id: q.id, pairs: null }

  const send = (given: Record<string, SimulationAnswerPayload>) => {
    submit.mutate(
      questions.map((q) => given[q.id] ?? blank(q)),
      {
        onSuccess: (attempt) => {
          setResult(attempt)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        },
      },
    )
  }

  /** Mette a schermo un'altra domanda, qualunque sia la direzione. */
  const show = (target: number) => {
    setIndex(target)
    setReached((furthest) => Math.max(furthest, target))
    // In cima subito e non con lo scorrimento morbido: sulla scelta multipla
    // la domanda nuova ha già il suo cronometro che corre, e non deve
    // arrivare da sotto.
    window.scrollTo({ top: 0 })
  }

  /* Una domanda consegnata sulla scelta multipla: si registra la risposta con
   * il suo tempo e si passa avanti, o si consegna il test se quella era
   * l'ultima. Le risposte di prima arrivano dallo stato, quella appena data
   * no: `send` riceve la mappa già completa perché lo stato aggiornato non è
   * leggibile nello stesso giro. */
  const handleChoice = (choice: number | null, elapsedMs: number) => {
    const question = questions[index]
    const given = {
      ...answers,
      [question.id]: { question_id: question.id, selected_option: choice, elapsed_ms: elapsedMs },
    }
    setAnswers(given)
    if (index + 1 < total) show(index + 1)
    else send(given)
  }

  /* Le risposte dei tre tipi senza cronometro: quello che ha scritto,
   * l'ordine in cui ha disposto i passi, le coppie che ha formato. Arrivano
   * a ogni modifica, e andare avanti o indietro è un'altra cosa: qui si
   * registra e basta. Una sola funzione perché cambia solo il campo che si
   * riempie. */
  const handleGiven = (answer: Omit<SimulationAnswerPayload, 'question_id'>) => {
    const question = questions[index]
    setAnswers((prev) => ({ ...prev, [question.id]: { question_id: question.id, ...answer } }))
  }

  /* Avanti sui tre tipi senza cronometro: la risposta è già registrata, e
   * dall'ultima domanda si consegna. Le risposte sono quelle dello stato,
   * che è aggiornato perché l'ultima modifica è arrivata in un giro prima. */
  const next = () => {
    if (index + 1 < total) show(index + 1)
    else send(answers)
  }

  /* Una domanda ha una risposta se il campo del suo tipo non è vuoto. Serve
   * alla barra per distinguere una domanda vista e lasciata in bianco da una
   * risposta, che con il ritorno indietro non coincidono più con "prima di
   * questa" e "questa". */
  const hasAnswer = (question: SimulationQuestion) => {
    const given = answers[question.id]
    return (given?.answer_text ?? given?.ordered_steps ?? given?.pairs) != null
  }

  /* Un segno per domanda. Sulla scelta multipla non si torna indietro,
   * quindi tutto quello che sta prima è consegnato e tutto quello che sta
   * dopo deve ancora comparire, in bianco o no. */
  const marks: ProgressMark[] = questions.map((question, i) =>
    i === index
      ? 'current'
      : (timed ? i < index : hasAnswer(question))
        ? 'done'
        : i <= reached
          ? 'seen'
          : 'todo',
  )

  /* Riprovare il test torna alle regole con le mani vuote: le domande di
   * prima si buttano, perché il tentativo nuovo ne avrà altre estratte
   * quando lo si comincerà. */
  const restart = () => {
    setResult(null)
    setAnswers({})
    setIndex(0)
    setReached(0)
    setSequences({})
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
          description="Esito del test appena consegnato"
          /* A test consegnato i comandi sono due e stanno insieme, uno accanto
             all'altro nell'intestazione: riprovare e tornare all'elenco sono la
             stessa scelta vista da due lati, e finché il primo stava dentro il
             riquadro dell'esito e il secondo qui sopra bisognava cercarli in
             due punti diversi della schermata. */
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <PrimaryButton onClick={restart}>Riprova il Test</PrimaryButton>
              <BackToList />
            </div>
          }
        />
        {/* Anche a test consegnato: da qui si torna al percorso, che è dove si
            vede se la tappa è stata superata e cosa viene dopo. */}
        <PathStepNotice kind="simulation" targetId={simulationId} className="mb-6" />
        <SimulationResult attempt={result} />
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
              : 'Prenditi il tempo necessario e torna pure sulle domande già viste, il riepilogo viene mostrato al termine.'
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
              al riquadro ci sarebbe già la barra del tempo. Senza cronometro
              i trattini si premono, e portano alla domanda già vista. */}
          <SimulationProgress
            marks={marks}
            onSelect={timed ? undefined : (target) => target !== index && show(target)}
          />
          {/* La chiave rimonta il passo a ogni domanda, e con lui il cronometro
              o la casella: è il rimontaggio a rimettere a trenta i secondi e a
              svuotare quello che si era scritto, non un effetto. Tornando su
              una domanda il rimontaggio riparte da `initial`, cioè da quello
              che si era lasciato. */}
          {(() => {
            /* La chiave sta fuori da questi campi e si scrive su ogni passo:
               è quella che rimonta il componente a ogni domanda, e React non
               la legge se arriva dentro uno spread. */
            const question = questions[index]
            const key = question.id
            const step = {
              question,
              number: index + 1,
              total,
              isLast: index + 1 === total,
            }
            if (timed) {
              return <SimulationQuestionStep key={key} {...step} onAnswer={handleChoice} />
            }
            const moves = {
              onNext: next,
              onBack: index > 0 ? () => show(index - 1) : undefined,
            }
            if (kind === 'open') {
              return (
                <SimulationOpenQuestionStep
                  key={key}
                  {...step}
                  {...moves}
                  initial={answers[key]?.answer_text}
                  onChange={(answer_text: string | null) => handleGiven({ answer_text })}
                />
              )
            }
            if (kind === 'ordering') {
              return (
                <SimulationOrderingStep
                  key={key}
                  {...step}
                  {...moves}
                  initial={sequences[key]}
                  onChange={(ordered_steps: string[] | null, placed: (string | null)[]) => {
                    handleGiven({ ordered_steps })
                    setSequences((prev) => ({ ...prev, [key]: placed }))
                  }}
                />
              )
            }
            return (
              <SimulationMatchingStep
                key={key}
                {...step}
                {...moves}
                initial={answers[key]?.pairs}
                onChange={(pairs: SimulationPair[] | null) => handleGiven({ pairs })}
              />
            )
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
