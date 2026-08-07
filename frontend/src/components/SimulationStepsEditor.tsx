import { MAX_ITEMS, MIN_ITEMS } from '../services/simulations'
import { PlusIcon, TrashIcon } from './icons'
import MoveControls, { moved } from './MoveControls'
import Tooltip from './Tooltip'

/* La chiave di una domanda di ordinamento: i passi nella sequenza corretta.
 *
 * Qui l'ordine **è** la risposta, e non c'è nessuna casella da spuntare che
 * lo dica: quello che si legge dall'alto in basso è quello che il test si
 * aspetta. Per questo i numeri accanto ai passi non sono decorazione ma la
 * chiave stessa, e le frecce sono l'unico modo di scriverla.
 *
 * Chi svolge il test riceve gli stessi passi mescolati, e per la stessa
 * ragione qui compare l'avviso sui passi che si mettono in fila da soli: un
 * passo che comincia con "poi" regala la risposta a chi non conosce la
 * procedura, e a scriverlo si fa senza accorgersene. */
export default function SimulationStepsEditor({
  index,
  steps,
  onChange,
  disabled = false,
}: {
  /** La posizione della domanda, per le etichette di accessibilità. */
  index: number
  steps: string[]
  onChange: (steps: string[]) => void
  disabled?: boolean
}) {
  const setStep = (stepIndex: number, value: string) =>
    onChange(steps.map((step, i) => (i === stepIndex ? value : step)))

  return (
    <div className="mb-3">
      <span className="mb-1 block text-xs font-medium tracking-wide text-slate-400">
        Passi nella sequenza corretta
      </span>
      <div className="flex flex-col gap-1.5">
        {steps.map((step, stepIndex) => (
          <div key={stepIndex} className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-violet-600/30 bg-violet-600/10 text-xs font-bold text-violet-400">
              {stepIndex + 1}
            </span>
            <input
              type="text"
              value={step}
              onChange={(e) => setStep(stepIndex, e.target.value)}
              disabled={disabled}
              placeholder={`Passo ${stepIndex + 1}`}
              aria-label={`Passo ${stepIndex + 1} della domanda ${index + 1}`}
              className="flex-1 rounded-xl border border-white/6 bg-white/4 px-3 py-1.5 text-[0.85rem] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-600 disabled:opacity-50"
            />
            <MoveControls
              label={step || `passo ${stepIndex + 1}`}
              onUp={() => onChange(moved(steps, stepIndex, stepIndex - 1))}
              onDown={() => onChange(moved(steps, stepIndex, stepIndex + 1))}
              canMoveUp={stepIndex > 0}
              canMoveDown={stepIndex < steps.length - 1}
              disabled={disabled}
            />
            {/* `wrap` perché il bottone si disabilita al minimo, e un bottone
                disabilitato non emette eventi mouse: senza involucro il
                tooltip che spiega il perché non comparirebbe. */}
            <Tooltip
              wrap
              content={
                steps.length <= MIN_ITEMS ? `Servono almeno ${MIN_ITEMS} passi` : 'Rimuovi il passo'
              }
            >
              <button
                type="button"
                onClick={() => onChange(steps.filter((_, i) => i !== stepIndex))}
                disabled={disabled || steps.length <= MIN_ITEMS}
                aria-label={`Rimuovi il passo ${stepIndex + 1} dalla domanda ${index + 1}`}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-600 transition hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-600"
              >
                <TrashIcon size={13} />
              </button>
            </Tooltip>
          </div>
        ))}
        {steps.length < MAX_ITEMS && (
          <button
            type="button"
            onClick={() => onChange([...steps, ''])}
            disabled={disabled}
            className="mt-0.5 flex w-fit cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-white/5 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PlusIcon size={13} />
            Aggiungi passo
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Chi svolge il test li riceve in ordine sparso. Evita di iniziare un passo con «poi» o
        «infine»: rivelerebbe la posizione senza che la procedura sia conosciuta
      </p>
    </div>
  )
}
