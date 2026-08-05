import type { SimulationQuestionPayload } from '../services/simulations'
import { textareaCls } from './Field'
import { optionLabel } from './simulationFormat'

/* Una domanda in revisione: il testo, la chiave e la spiegazione che leggerà
 * chi sbaglia.
 *
 * La chiave è una cosa diversa nei due tipi di test, e questo componente ne
 * mostra una sola. Su una domanda a scelta multipla sono le quattro
 * alternative, e la corretta si sceglie cliccando la sua lettera invece che
 * da una tendina a parte: la tendina lascerebbe scrivere "corretta: C" con la
 * C vuota, mentre così la scelta vive addosso all'alternativa che indica.
 * Su una domanda aperta è la traccia della risposta attesa, che è il metro
 * con cui il modello giudicherà quello che l'operatore scrive: qui il super
 * admin non sta correggendo un refuso, sta scrivendo la regola del voto. */

interface SimulationQuestionEditorProps {
  index: number
  question: SimulationQuestionPayload
  /** Il test è a risposta aperta: al posto delle alternative, la traccia. */
  open?: boolean
  onChange: (question: SimulationQuestionPayload) => void
  disabled?: boolean
}

export default function SimulationQuestionEditor({
  index,
  question,
  open = false,
  onChange,
  disabled = false,
}: SimulationQuestionEditorProps) {
  const setOption = (optionIndex: number, value: string) => {
    const options = [...(question.options ?? [])]
    options[optionIndex] = value
    onChange({ ...question, options })
  }

  return (
    <li className="rounded-2xl border border-white/6 bg-white/3 p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="mt-2 shrink-0 text-xs font-semibold text-slate-500">{index + 1}.</span>
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

      {open ? (
        <div className="mb-3 pl-6">
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
            placeholder="Cosa deve dire una risposta per essere considerata completa"
            disabled={disabled}
          />
          <p className="mt-1 text-xs text-slate-500">
            È il metro con cui viene corretta ogni risposta: elenca i punti che devono esserci, non
            scrivere una bella pagina
          </p>
        </div>
      ) : (
        <div className="mb-3 flex flex-col gap-1.5 pl-6">
          {(question.options ?? []).map((option, optionIndex) => {
            const isCorrect = question.correct_option === optionIndex
            return (
              <div key={optionIndex} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ ...question, correct_option: optionIndex })}
                  disabled={disabled}
                  aria-pressed={isCorrect}
                  aria-label={`Segna l'alternativa ${optionLabel(optionIndex)} come corretta`}
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
              </div>
            )
          })}
        </div>
      )}

      <div className="pl-6">
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
          placeholder="Perché la risposta corretta è quella, secondo il documento"
          disabled={disabled}
        />
      </div>
    </li>
  )
}
