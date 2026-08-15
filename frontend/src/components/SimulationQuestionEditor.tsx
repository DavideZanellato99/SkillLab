import { MAX_OPTIONS, MIN_OPTIONS } from '../services/simulations'
import type { SimulationKind, SimulationQuestionPayload } from '../services/simulations'
import { textareaCls } from './Field'
import { PlusIcon, TrashIcon } from './icons'
import SimulationPairsEditor from './SimulationPairsEditor'
import SimulationStepsEditor from './SimulationStepsEditor'
import { optionLabel } from './simulationFormat'
import Tooltip from './Tooltip'

/* Una domanda in revisione: il testo, la chiave e la spiegazione che leggerà
 * chi sbaglia.
 *
 * La chiave è una cosa diversa in ognuno dei quattro tipi di test, e questo
 * componente ne mostra una sola, quella del tipo. Su una domanda a scelta
 * multipla sono le alternative, e la corretta si sceglie cliccando la sua
 * lettera invece che da una tendina a parte: la tendina lascerebbe scrivere
 * "corretta: C" con la C vuota, mentre così la scelta vive addosso
 * all'alternativa che indica.
 * Su una domanda aperta è la traccia della risposta attesa, che è il metro
 * con cui il modello giudicherà quello che l'operatore scrive: qui il super
 * admin non sta correggendo un refuso, sta scrivendo la regola del voto.
 * Sulle altre due è un elenco che si scrive già risolto, i passi in sequenza
 * o le coppie accoppiate, e sta in un componente suo perché non somiglia a
 * niente di quello che c'è qui.
 *
 * Quante siano le alternative lo decide chi scrive, da due a sei, domanda per
 * domanda: il modello ne scrive quattro, ma una domanda a mano può averne due
 * o cinque senza che questo cambi niente a chi risponde. Togliere quella
 * segnata come corretta lascia la domanda senza chiave, ed è voluto: la
 * risposta giusta si sceglie di nuovo, invece di scivolare da sola su
 * un'alternativa che nessuno ha indicato. */

interface SimulationQuestionEditorProps {
  index: number
  question: SimulationQuestionPayload
  /** Il tipo del test, che decide quale chiave si scrive. */
  kind: SimulationKind
  onChange: (question: SimulationQuestionPayload) => void
  /** Toglie la domanda dal serbatoio. Assente dove il serbatoio è fisso. */
  onRemove?: () => void
  /* Cosa il controllo del serbatoio ha trovato su questa domanda. Le
   * segnalazioni stanno anche in cima all'elenco, nel loro pannello, ma
   * quello si legge una volta e poi si scende a correggere: senza il segno
   * qui, chi è arrivato alla domanda 31 dovrebbe risalire per ricordarsi
   * cosa non andava. */
  findings?: string[]
  disabled?: boolean
}

export default function SimulationQuestionEditor({
  index,
  question,
  kind,
  onChange,
  onRemove,
  findings = [],
  disabled = false,
}: SimulationQuestionEditorProps) {
  const options = question.options ?? []

  const setOption = (optionIndex: number, value: string) => {
    const next = [...options]
    next[optionIndex] = value
    onChange({ ...question, options: next })
  }

  const addOption = () => onChange({ ...question, options: [...options, ''] })

  /* Togliere un'alternativa sposta le lettere di quelle dopo, e con loro
   * l'indice della corretta: senza questo conto la risposta giusta resterebbe
   * scritta sulla posizione di prima, che ora è un'altra alternativa. */
  const removeOption = (optionIndex: number) => {
    const next = options.filter((_, i) => i !== optionIndex)
    const correct = question.correct_option
    onChange({
      ...question,
      options: next,
      correct_option:
        correct === null || correct === optionIndex
          ? null
          : correct > optionIndex
            ? correct - 1
            : correct,
    })
  }

  return (
    /* L'ancora porta il numero della domanda, cioè la sua posizione nel
       serbatoio: è il numero con cui una segnalazione del controllo la
       nomina, ed è quello che permette di saltarci sopra da lì. */
    <li
      id={`simulation-question-${index + 1}`}
      className="rounded-2xl border border-white/6 bg-white/3 p-4"
    >
      {/* Il numero e il cestino stanno in cima alla scheda, non addosso al
          testo: il cestino butta via tutta la domanda, non la riga accanto a
          cui si trova, e da qui il testo prende tutta la larghezza. */}
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold tracking-wide text-slate-500">
          Domanda {index + 1}
        </span>
        {onRemove && (
          <Tooltip content="Elimina la domanda">
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              aria-label={`Elimina la domanda ${index + 1}`}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-600 transition hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-600"
            >
              <TrashIcon size={14} />
            </button>
          </Tooltip>
        )}
      </div>

      {/* Sopra il testo e non sotto: è la cosa da sapere prima di rileggere
          la domanda, non un commento a quello che si è appena letto. */}
      {findings.length > 0 && (
        <ul className="mb-3 flex list-none flex-col gap-1 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2">
          {findings.map((message, i) => (
            <li key={i} className="text-xs leading-relaxed text-amber-200">
              {message}
            </li>
          ))}
        </ul>
      )}

      <div className="mb-3">
        <textarea
          className={textareaCls}
          rows={2}
          value={question.text}
          onChange={(e) => onChange({ ...question, text: e.target.value })}
          placeholder="Testo della domanda"
          disabled={disabled}
          aria-label={`Testo della domanda ${index + 1}`}
        />
      </div>

      {kind === 'ordering' ? (
        <SimulationStepsEditor
          index={index}
          steps={question.ordered_steps ?? []}
          onChange={(ordered_steps) => onChange({ ...question, ordered_steps })}
          disabled={disabled}
        />
      ) : kind === 'matching' ? (
        <SimulationPairsEditor
          index={index}
          pairs={question.pairs ?? []}
          onChange={(pairs) => onChange({ ...question, pairs })}
          disabled={disabled}
        />
      ) : kind === 'open' ? (
        <div className="mb-3">
          <label
            className="mb-1 block text-xs font-medium tracking-wide text-slate-400"
            htmlFor={`expected-${index}`}
          >
            Risposta attesa
          </label>
          <textarea
            id={`expected-${index}`}
            className={textareaCls}
            rows={4}
            value={question.expected_answer}
            onChange={(e) => onChange({ ...question, expected_answer: e.target.value })}
            placeholder="Gli elementi che una risposta deve contenere per essere considerata completa"
            disabled={disabled}
          />
          <p className="mt-1 text-xs text-slate-500">
            È il criterio con cui viene corretta ogni risposta: elenca gli elementi richiesti, senza
            redigere un testo esteso
          </p>
        </div>
      ) : (
        <div className="mb-3 flex flex-col gap-1.5">
          {options.map((option, optionIndex) => {
            const isCorrect = question.correct_option === optionIndex
            return (
              <div key={optionIndex} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ ...question, correct_option: optionIndex })}
                  disabled={disabled}
                  aria-pressed={isCorrect}
                  aria-label={`Indica l'alternativa ${optionLabel(optionIndex)} come corretta`}
                  className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border text-xs font-bold transition disabled:cursor-not-allowed ${
                    isCorrect
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                      : 'border-white/6 bg-white/4 text-slate-500 hover:border-white/12 hover:text-slate-300'
                  }`}
                >
                  {optionLabel(optionIndex)}
                </button>
                <input
                  type="text"
                  value={option}
                  onChange={(e) => setOption(optionIndex, e.target.value)}
                  disabled={disabled}
                  placeholder={`Alternativa ${optionLabel(optionIndex)}`}
                  aria-label={`Alternativa ${optionLabel(optionIndex)} della domanda ${index + 1}`}
                  className={`flex-1 rounded-xl border px-3 py-1.5 text-[0.85rem] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-600 disabled:opacity-50 ${
                    isCorrect
                      ? 'border-emerald-500/25 bg-emerald-500/6'
                      : 'border-white/6 bg-white/4'
                  }`}
                />
                {/* `wrap` perché il bottone si disabilita quando le alternative
                    sono il minimo, e un bottone disabilitato non emette eventi
                    mouse: senza involucro il tooltip che spiega il perché non
                    comparirebbe proprio quando serve. */}
                <Tooltip
                  wrap
                  content={
                    options.length <= MIN_OPTIONS
                      ? `Servono almeno ${MIN_OPTIONS} alternative`
                      : "Rimuovi l'alternativa"
                  }
                >
                  <button
                    type="button"
                    onClick={() => removeOption(optionIndex)}
                    disabled={disabled || options.length <= MIN_OPTIONS}
                    aria-label={`Rimuovi l'alternativa ${optionLabel(optionIndex)} dalla domanda ${index + 1}`}
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-600 transition hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-600"
                  >
                    <TrashIcon size={13} />
                  </button>
                </Tooltip>
              </div>
            )
          })}
          {options.length < MAX_OPTIONS && (
            <button
              type="button"
              onClick={addOption}
              disabled={disabled}
              className="mt-0.5 flex w-fit cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-white/5 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PlusIcon size={13} />
              Aggiungi alternativa
            </button>
          )}
          {question.correct_option === null && options.length > 0 && (
            <p className="mt-1 text-xs text-amber-400/80">Indica quale alternativa è corretta</p>
          )}
        </div>
      )}

      <div>
        <label
          className="mb-1 block text-xs font-medium tracking-wide text-slate-400"
          htmlFor={`explanation-${index}`}
        >
          Spiegazione
        </label>
        <textarea
          id={`explanation-${index}`}
          className={textareaCls}
          rows={2}
          value={question.explanation}
          onChange={(e) => onChange({ ...question, explanation: e.target.value })}
          placeholder="Perché quella è la risposta corretta. Viene mostrata a chi ha appena risposto"
          disabled={disabled}
        />
      </div>
    </li>
  )
}
