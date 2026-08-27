import { useEffect, useRef, useState } from 'react'
import { useCloseGuard } from '../hooks/useCloseGuard'
import { useLeaveConfirmation } from '../hooks/useLeaveConfirmation'
import {
  useAdminSimulation,
  useGenerateQuestions,
  useReplaceSimulationDocument,
  useReviewPool,
  useSaveQuestions,
  useSimulationResults,
  useUpdateSimulation,
  useUpdateSimulationStatus,
} from '../hooks/useSimulations'
import {
  MIN_ITEMS,
  MIN_OPTIONS,
  POOL_COUNT,
  QUESTION_COUNT,
  requiredPool,
} from '../services/simulations'
import type {
  SimulationKind,
  SimulationQuestionAdmin,
  SimulationQuestionPayload,
} from '../services/simulations'
import ModalShell from './ModalShell'
import LoadingState from './LoadingState'
import PrimaryButton from './PrimaryButton'
import Spinner from './Spinner'
import FormError from './FormError'
import FormSuccess from './FormSuccess'
import Badge from './Badge'
import TabBar from './TabBar'
import { PlusIcon } from './icons'
import SimulationAttemptModal from './SimulationAttemptModal'
import SimulationQuestionEditor from './SimulationQuestionEditor'
import SimulationReviewPanel from './SimulationReviewPanel'
import SimulationSettingsPanel from './SimulationSettingsPanel'
import UnsavedChangesModal from './UnsavedChangesModal'
import SimulationKindBadge from './SimulationKindBadge'
import SimulationSourceBadge from './SimulationSourceBadge'
import { formatScore, scoreBadgeTone, statusBadgeTone, statusLabel } from './simulationFormat'
import { formatDateTime } from './dateFormat'

/* Il pannello in cui una simulazione diventa un test: si scrivono le domande,
 * si rileggono, si correggono e si pubblica. Si apre dalla matita nella
 * tabella, come il form di modifica di un utente, di un'organizzazione o di un
 * avatar: il clic sulla riga porta invece alla scheda di sola lettura.
 *
 * Le domande arrivano da due strade e il pannello è lo stesso: generate dal
 * documento con un bottone, oppure scritte una per una da chi prepara il
 * test. Cambia il modo di riempire l'elenco, non l'elenco: le stesse
 * correzioni, lo stesso salvataggio in blocco, la stessa pubblicazione. Da
 * quale strada venga la simulazione lo dice `source`, deciso alla creazione.
 *
 * Sta tutto in una modale perché è un gesto solo, con un ordine che non si
 * può saltare: la pubblicazione è in fondo, dopo le domande, e il bottone
 * dice cosa manca invece di limitarsi a essere spento.
 *
 * Le domande si modificano su una copia locale e si salvano in blocco. Chi
 * corregge un refuso in una spiegazione lo fa insieme al resto, e un salvataggio
 * per tasto premuto trasformerebbe una revisione in cinquanta scritture. */

const secondaryBtnCls =
  'flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50'

function toPayload(questions: SimulationQuestionAdmin[]): SimulationQuestionPayload[] {
  return questions.map((q) => ({
    text: q.text,
    options: q.options.length ? [...q.options] : null,
    correct_option: q.correct_option,
    expected_answer: q.expected_answer,
    ordered_steps: q.ordered_steps ? [...q.ordered_steps] : null,
    pairs: q.pairs ? q.pairs.map((p) => ({ ...p })) : null,
    explanation: q.explanation,
  }))
}

/* Una domanda appena aggiunta: vuota, con tanti elementi quanti ne
 * scriverebbe il modello. Sono punti di partenza e non regole: chi ne vuole
 * tre ne toglie uno, chi ne vuole sei li aggiunge (vedi
 * SimulationQuestionEditor). */
const NEW_OPTION_COUNT = 4
const NEW_ITEM_COUNT = 5

/* Come si chiama la chiave di ogni tipo, nelle due frasi che spiegano cosa
 * contiene una domanda di questo test. Sono le stesse parole che l'editor
 * scrive sopra il campo, e devono restare quelle: chi legge "comprende i
 * passi in sequenza" e poi trova un campo intitolato in un altro modo pensa
 * di aver aperto la cosa sbagliata. */
const KEY_NAMES: Record<SimulationKind, string> = {
  multiple: 'le alternative',
  open: 'la risposta attesa',
  ordering: 'i passi nella sequenza corretta',
  matching: 'le coppie corrette',
}

const GENERATED_KEY_NAMES: Record<SimulationKind, string> = {
  multiple: 'con quattro alternative ciascuna',
  open: 'con la traccia della risposta attesa',
  ordering: 'con cinque passi da riordinare ciascuna',
  matching: 'con cinque coppie da abbinare ciascuna',
}

function blankQuestion(kind: SimulationKind): SimulationQuestionPayload {
  return {
    text: '',
    options: kind === 'multiple' ? Array<string>(NEW_OPTION_COUNT).fill('') : null,
    correct_option: null,
    expected_answer: '',
    ordered_steps: kind === 'ordering' ? Array<string>(NEW_ITEM_COUNT).fill('') : null,
    /* `from` e non `fill`: `fill` metterebbe lo stesso oggetto in tutte e
     * cinque le righe, e la prima modifica che lo mutasse cambierebbe la
     * domanda intera. */
    pairs:
      kind === 'matching'
        ? Array.from({ length: NEW_ITEM_COUNT }, () => ({ left: '', right: '' }))
        : null,
    explanation: '',
  }
}

/* Una riga mai toccata. Si aggiunge una domanda, ci si ripensa, e quella riga
 * non deve arrivare al server: là una domanda senza nemmeno il testo è un
 * errore, e qui è solo una riga aggiunta per sbaglio. Si toglie al momento del
 * salvataggio invece di vietare l'aggiunta, così chi ne apre tre e ne scrive
 * due non deve chiudere niente. */
function isBlank(question: SimulationQuestionPayload): boolean {
  return (
    !question.text.trim() &&
    !question.explanation.trim() &&
    !question.expected_answer.trim() &&
    (question.options ?? []).every((o) => !o.trim()) &&
    (question.ordered_steps ?? []).every((s) => !s.trim()) &&
    (question.pairs ?? []).every((p) => !p.left.trim() && !p.right.trim())
  )
}

/** Una domanda è pronta quando ha il testo e la chiave del suo tipo. */
function isComplete(question: SimulationQuestionPayload, kind: SimulationKind): boolean {
  if (!question.text.trim()) return false
  if (kind === 'open') return Boolean(question.expected_answer.trim())
  if (kind === 'ordering') {
    const steps = question.ordered_steps ?? []
    return steps.length >= MIN_ITEMS && steps.every((s) => s.trim()) && !hasDuplicates(steps)
  }
  if (kind === 'matching') {
    const pairs = question.pairs ?? []
    return (
      pairs.length >= MIN_ITEMS &&
      pairs.every((p) => p.left.trim() && p.right.trim()) &&
      !hasDuplicates(pairs.map((p) => p.left)) &&
      !hasDuplicates(pairs.map((p) => p.right))
    )
  }
  const options = question.options ?? []
  return (
    options.length >= MIN_OPTIONS &&
    options.every((o) => o.trim()) &&
    question.correct_option !== null
  )
}

/* Due elementi uguali sono due risposte giuste, e la pubblicazione li
 * rifiuta: qui si conta come una domanda non finita, così il bottone lo dice
 * prima che il server risponda 409. Lo stesso confronto del backend, spazi e
 * maiuscole perdonati. */
function hasDuplicates(values: string[]): boolean {
  const keys = values.map((v) => v.trim().replace(/\s+/g, ' ').toLowerCase())
  return new Set(keys).size !== keys.length
}

interface SimulationEditorModalProps {
  simulationId: string
  /** Falso per chi ne amministra una sola: sarebbe la sua, su ogni pannello. */
  showOrganization?: boolean
  onClose: () => void
}

export default function SimulationEditorModal({
  simulationId,
  showOrganization = true,
  onClose,
}: SimulationEditorModalProps) {
  const { data: simulation, isLoading } = useAdminSimulation(simulationId)
  const generate = useGenerateQuestions(simulationId)
  const review = useReviewPool(simulationId)
  const save = useSaveQuestions(simulationId)
  const setStatus = useUpdateSimulationStatus(simulationId)
  const updateDetails = useUpdateSimulation(simulationId)
  const replaceDocument = useReplaceSimulationDocument(simulationId)

  const [tab, setTab] = useState<'questions' | 'results' | 'settings'>('questions')
  const { data: results = [] } = useSimulationResults(simulationId, tab === 'results')

  const [draft, setDraft] = useState<SimulationQuestionPayload[]>([])
  const [saved, setSaved] = useState(false)
  /** Il tentativo che si sta rileggendo, aperto da una riga dei risultati. */
  const [openAttempt, setOpenAttempt] = useState<string | null>(null)

  /* La copia locale si riallinea quando il serbatoio del server cambia
   * davvero, e non a ogni lettura.
   *
   * Le domande arrivano in un array nuovo ogni volta, quindi riallinearsi
   * all'oggetto vorrebbe dire buttare il lavoro in corso a ogni ricontrollo
   * della query: chi ha scritto venti domande, è passato al documento aperto
   * in un'altra finestra e torna qui se le ritroverebbe com'erano sul
   * server. Il confronto è sul contenuto, che cambia dopo una generazione o
   * un salvataggio e resta uguale quando il server rimanda quelle di prima. */
  const synced = useRef<string | null>(null)
  useEffect(() => {
    if (!simulation) return
    const questions = toPayload(simulation.questions)
    const signature = JSON.stringify(questions)
    if (signature === synced.current) return
    synced.current = signature
    setDraft(questions)
  }, [simulation])

  /* Titolo e descrizione in scrittura stanno qui e non nel pannello che li
   * disegna: chi corregge il titolo e passa alle domande non deve ritrovarlo
   * com'era. Si riallineano quando li cambia il server, non a ogni lettura,
   * perché le dipendenze sono i due valori e non la simulazione intera. */
  const [details, setDetails] = useState({ title: '', description: '' })
  const serverTitle = simulation?.title
  const serverDescription = simulation?.description ?? ''
  useEffect(() => {
    if (serverTitle === undefined) return
    setDetails({ title: serverTitle, description: serverDescription })
  }, [serverTitle, serverDescription])

  const busy =
    generate.isPending ||
    save.isPending ||
    setStatus.isPending ||
    review.isPending ||
    updateDetails.isPending ||
    replaceDocument.isPending
  const isPublished = simulation?.status === 'published'
  const kind = simulation?.kind ?? 'multiple'
  const isManual = simulation?.source === 'manual'
  const required = requiredPool(simulation?.source ?? 'ai')
  /* Le righe che contano: una appena aggiunta e ancora vuota non è una
   * domanda, quindi non si salva e non si conta verso il serbatoio. */
  const written = draft.filter((q) => !isBlank(q))
  const enough = written.length >= required
  const allWritten = written.every((q) => isComplete(q, kind))
  const complete = enough && allWritten

  /* Cosa andrebbe perso chiudendo adesso: le domande scritte e diverse da
   * quelle del server, o un titolo corretto e non ancora salvato. Le righe
   * vuote appena aggiunte non contano, come non contano nel salvataggio: una
   * finestra che chiede conferma per una riga aperta e mai riempita insegna
   * a rispondere senza leggere. */
  const questionsChanged = JSON.stringify(written) !== synced.current
  const detailsChanged =
    simulation !== undefined &&
    (details.title !== simulation.title || details.description !== (simulation.description ?? ''))
  const unsaved = questionsChanged || detailsChanged

  /* Le due vie di uscita, che vanno presidiate tutte e due: la X, Esc e lo
   * sfondo passano dalla conferma, mentre il ricaricare o chiudere la scheda
   * lo ferma il browser, come durante un test in corso. */
  const closeGuard = useCloseGuard(unsaved, onClose)
  useLeaveConfirmation(unsaved)

  /* Il buon esito non resta a schermo: quando è ancora lì cinque minuti
   * dopo, «Domande salvate» sembra riferirsi all'ultima cosa scritta invece
   * che al salvataggio di prima. */
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 4000)
    return () => clearTimeout(timer)
  }, [saved])

  const addQuestion = () => {
    setSaved(false)
    setDraft((prev) => [...prev, blankQuestion(kind)])
  }

  /* Le segnalazioni raccolte per domanda, così ogni riga porta le proprie.
   * La chiave è la posizione e non l'indice nell'elenco: sono lo stesso
   * numero finché nessuno tocca il serbatoio, ma su una simulazione scritta
   * a mano una domanda si può togliere, e da quel momento l'esito parla di
   * una fila che non c'è più. A dirlo è comunque `is_stale`, e qui una
   * posizione che non esiste semplicemente non trova nessuna riga. */
  const findingsByPosition = new Map<number, string[]>()
  for (const finding of simulation?.review?.findings ?? []) {
    for (const position of finding.positions) {
      findingsByPosition.set(position, [
        ...(findingsByPosition.get(position) ?? []),
        finding.message,
      ])
    }
  }

  /* Dalla segnalazione alla domanda. Il pannello sta in cima a un elenco che
   * può essere lungo cinquanta schede, e senza questo "la domanda 37" sarebbe
   * un numero da andare a cercare a mano.
   *
   * Insieme alla pagina si sposta il fuoco, sul testo della domanda: senza,
   * chi lavora da tastiera vedrebbe scorrere lo schermo e poi ripartirebbe
   * col Tab dal pannello del controllo, cioè da cinquanta schede più in su.
   * Lo scorrimento resta quello morbido di sopra, quindi il fuoco non deve
   * saltarci sopra di suo. */
  const goToQuestion = (position: number) => {
    const node = document.getElementById(`simulation-question-${position}`)
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    node?.querySelector('textarea')?.focus({ preventScroll: true })
  }

  /* Pubblicare salva prima le domande: quello che finisce davanti agli utenti
   * deve essere quello che il super admin sta guardando, non l'ultima
   * versione che era stata salvata prima delle correzioni di adesso. */
  const publish = () => {
    setSaved(false)
    save.mutate(written, { onSuccess: () => setStatus.mutate('published') })
  }

  const error =
    (generate.error as Error | null)?.message ??
    (save.error as Error | null)?.message ??
    (setStatus.error as Error | null)?.message

  return (
    <ModalShell
      onClose={closeGuard.requestClose}
      locked={busy}
      size="full"
      padding="none"
      layout="column"
      label="Modifica del test tecnico"
    >
      {isLoading || !simulation ? (
        <LoadingState message="Caricamento simulazione..." variant="modal" />
      ) : (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/6 px-8 py-5">
            <div className="min-w-0">
              <h2 className="font-heading text-xl font-bold text-slate-100">{simulation.title}</h2>
              {/* Il documento e i suoi passaggi si nominano dove esistono:
                  su un test scritto a mano non c'è niente da indicizzare, e
                  "0 passaggi" farebbe sembrare rotto un caricamento che non
                  è mai stato chiesto. Che sia scritto a mano lo dice la
                  targhetta accanto al titolo. */}
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                {showOrganization && <span>{simulation.organization_name}</span>}
                {!isManual && (
                  <>
                    {showOrganization && <span aria-hidden>·</span>}
                    <span className="truncate">{simulation.document_name}</span>
                    <span aria-hidden>·</span>
                    <span>{simulation.chunk_count} passaggi indicizzati</span>
                  </>
                )}
              </p>
            </div>
            <div className="mr-8 flex shrink-0 items-center gap-2">
              <SimulationKindBadge kind={simulation.kind} />
              <SimulationSourceBadge source={simulation.source} />
              <Badge tone={statusBadgeTone(simulation.status)}>
                {statusLabel(simulation.status)}
              </Badge>
            </div>
          </header>

          <TabBar
            items={[
              /* Le domande scritte, che sono anche quelle che si salvano e
                 quelle contate in fondo: la riga vuota appena aggiunta non è
                 ancora una domanda, e due numeri diversi per la stessa cosa
                 nella stessa finestra si leggono come un errore. */
              { value: 'questions', label: `Domande (${written.length})` },
              { value: 'results', label: `Risultati (${simulation.total_attempts})` },
              /* In fondo perché è quello che si apre di rado: il titolo si
                 corregge una volta, le domande si rileggono tutte. */
              { value: 'settings', label: 'Dati del test' },
            ]}
            value={tab}
            onChange={setTab}
            ariaLabel="Sezioni della simulazione"
            className="border-b border-white/6 px-8 py-2"
          />

          <div className="flex-1 overflow-y-auto px-8 py-5">
            {tab === 'questions' &&
              (draft.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-16 text-center">
                  <p className="text-[0.95rem] text-slate-400">
                    {isManual
                      ? 'Nessuna domanda presente. Le domande vanno redatte una per una'
                      : 'Nessuna domanda presente. Generale dal documento, poi rivedile prima della pubblicazione'}
                  </p>
                  <p className="max-w-md text-sm text-slate-500">
                    {isManual ? (
                      <>
                        Ogni domanda comprende {KEY_NAMES[kind]} e la spiegazione mostrata a chi ha
                        risposto. Ne servono almeno {required}, e ogni tentativo ne estrae{' '}
                        {QUESTION_COUNT} a caso: redigerne un numero maggiore riduce la
                        sovrapposizione fra due prove.
                      </>
                    ) : (
                      <>
                        La generazione analizza il documento, individua gli argomenti verificabili e
                        redige {POOL_COUNT} domande {GENERATED_KEY_NAMES[kind]}, sui passaggi che li
                        riguardano. Ogni tentativo ne estrae {QUESTION_COUNT} a caso. L'operazione
                        può richiedere qualche minuto.
                      </>
                    )}
                  </p>
                  {isManual && (
                    <PrimaryButton
                      icon={<PlusIcon size={16} />}
                      onClick={addQuestion}
                      disabled={busy}
                    >
                      Aggiungi la Prima Domanda
                    </PrimaryButton>
                  )}
                </div>
              ) : (
                <>
                  {/* In testa alle domande, perché è quello che si guarda
                      prima di cominciare a rileggerle. */}
                  <SimulationReviewPanel
                    review={simulation.review}
                    isPending={review.isPending}
                    error={
                      review.error
                        ? review.error instanceof Error
                          ? review.error.message
                          : 'Controllo non riuscito.'
                        : ''
                    }
                    disabled={busy && !review.isPending}
                    onRun={() => {
                      review.reset()
                      review.mutate()
                    }}
                    onGoTo={goToQuestion}
                  />
                  <ol className="flex list-none flex-col gap-3">
                    {draft.map((question, index) => (
                      <SimulationQuestionEditor
                        key={index}
                        index={index}
                        question={question}
                        kind={kind}
                        findings={findingsByPosition.get(index + 1)}
                        disabled={busy}
                        onChange={(updated) =>
                          setDraft((prev) => prev.map((q, i) => (i === index ? updated : q)))
                        }
                        /* Togliere una domanda ha senso dove il serbatoio si
                         * scrive a mano. Su una generata il serbatoio è
                         * cinquanta o niente, e una domanda in meno sarebbe
                         * solo una pubblicazione bloccata. */
                        onRemove={
                          isManual
                            ? () => {
                                setSaved(false)
                                setDraft((prev) => prev.filter((_, i) => i !== index))
                              }
                            : undefined
                        }
                      />
                    ))}
                  </ol>
                  {isManual && draft.length < POOL_COUNT && (
                    <button
                      type="button"
                      onClick={addQuestion}
                      disabled={busy}
                      className={`${secondaryBtnCls} mt-3 w-full border-dashed`}
                    >
                      <PlusIcon size={16} />
                      Aggiungi Domanda
                    </button>
                  )}
                </>
              ))}

            {tab === 'results' &&
              (results.length === 0 ? (
                <p className="py-16 text-center text-sm text-slate-500">
                  Nessun tentativo registrato per questo test
                </p>
              ) : (
                <ul className="flex list-none flex-col gap-2">
                  {results.map((attempt) => (
                    <li key={attempt.id}>
                      {/* La riga si apre, come nella dashboard e nel report
                          attività: qui ci sono il voto e i conteggi, mentre
                          quello che dice davvero com'è andata sono le
                          risposte, e stanno un clic più in là. */}
                      <button
                        type="button"
                        onClick={() => setOpenAttempt(attempt.id)}
                        aria-label={`Rileggi il test di ${attempt.user_name}`}
                        className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 rounded-xl border border-white/6 bg-white/3 px-4 py-3 text-left transition hover:border-violet-600/40 hover:bg-white/6"
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
                      </button>
                    </li>
                  ))}
                </ul>
              ))}

            {tab === 'settings' && (
              <SimulationSettingsPanel
                simulation={simulation}
                title={details.title}
                description={details.description}
                onChange={setDetails}
                onSave={() => {
                  setSaved(false)
                  updateDetails.reset()
                  updateDetails.mutate({
                    title: details.title.trim(),
                    description: details.description.trim(),
                  })
                }}
                isSaving={updateDetails.isPending}
                saved={updateDetails.isSuccess}
                error={(updateDetails.error as Error | null)?.message ?? ''}
                onReplaceDocument={(file, onDone) => {
                  setSaved(false)
                  replaceDocument.reset()
                  replaceDocument.mutate(file, { onSuccess: onDone })
                }}
                isReplacing={replaceDocument.isPending}
                documentError={(replaceDocument.error as Error | null)?.message ?? ''}
                disabled={busy}
              />
            )}
          </div>

          <footer className="flex flex-col gap-3 border-t border-white/6 px-8 py-4">
            {error && <FormError message={error} />}
            {saved && !error && <FormSuccess message="Domande salvate" />}

            {generate.isPending && (
              <p className="text-center text-xs text-slate-500">
                Analisi del documento e redazione delle domande in corso. Non chiudere questa
                finestra.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* La generazione esiste solo dove c'è un documento da leggere.
                  A mano il posto in cui l'elenco cresce è l'elenco stesso, in
                  fondo alle domande. */}
              {isManual ? (
                <span className="text-xs text-slate-500">
                  {written.length === 1
                    ? '1 domanda inserita'
                    : `${written.length} domande inserite`}
                  {written.length < required && `, ne servono ${required}`}
                </span>
              ) : (
                <button
                  type="button"
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
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className={secondaryBtnCls}
                  onClick={() => {
                    setSaved(false)
                    save.mutate(written, { onSuccess: () => setSaved(true) })
                  }}
                  /* Un elenco vuoto si salva solo se sul server qualcosa
                     c'era: è il modo di svuotare un serbatoio scritto a mano
                     per rifarlo da capo. Su una simulazione appena creata
                     invece non c'è niente da registrare. */
                  disabled={busy || (written.length === 0 && simulation.questions.length === 0)}
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
                    type="button"
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
                    ) : enough ? (
                      /* Le domande ci sono tutte ma qualcuna è a metà: dirlo
                       * è l'unico modo perché chi guarda sappia dove
                       * cercare, invece di contare righe che tornano. */
                      'Completa le domande incomplete'
                    ) : (
                      `Servono ${required} domande, attualmente ${written.length}`
                    )}
                  </PrimaryButton>
                )}
              </div>
            </div>
          </footer>

          {/* Un tentativo riletto per intero, con le risposte date. È la
              stessa finestra della dashboard e del report attività, e sta
              sopra questa perché è l'ultima cosa aperta. Senza il cestino:
              buttare via un tentativo è un gesto del report, non di chi sta
              preparando il test. */}
          {openAttempt && (
            <SimulationAttemptModal
              attemptId={openAttempt}
              elevated
              onClose={() => setOpenAttempt(null)}
            />
          )}

          {closeGuard.isAsking && (
            <UnsavedChangesModal
              description={
                questionsChanged
                  ? 'Le domande scritte dopo l’ultimo salvataggio andranno perse.'
                  : 'Il titolo e la descrizione non ancora salvati torneranno come erano.'
              }
              onKeepEditing={closeGuard.keepEditing}
              onDiscard={closeGuard.discard}
            />
          )}
        </>
      )}
    </ModalShell>
  )
}
