import { MAX_ITEMS, MIN_ITEMS } from '../services/simulations'
import type { SimulationPair } from '../services/simulations'
import { PlusIcon, TrashIcon } from './icons'
import Tooltip from './Tooltip'

/* La chiave di una domanda di abbinamento: le coppie già accoppiate.
 *
 * Si scrivono in riga, la voce e il suo abbinato, perché è così che si
 * rileggono per controllarle: una colonna sopra e una sotto costringerebbe a
 * contare le posizioni per capire cosa sta con cosa, che è esattamente
 * l'errore che questa schermata deve rendere impossibile. Chi svolge il test
 * riceve la colonna di destra mescolata, quindi qui l'ordine delle righe non
 * conta e non ci sono frecce per spostarle.
 *
 * L'avviso in fondo è la regola che regge il tipo: due voci che finiscono
 * sullo stesso abbinato producono una domanda in cui chi conosce la
 * procedura sbaglia lo stesso. */
export default function SimulationPairsEditor({
  index,
  pairs,
  onChange,
  disabled = false,
}: {
  /** La posizione della domanda, per le etichette di accessibilità. */
  index: number
  pairs: SimulationPair[]
  onChange: (pairs: SimulationPair[]) => void
  disabled?: boolean
}) {
  const setSide = (pairIndex: number, side: 'left' | 'right', value: string) =>
    onChange(pairs.map((pair, i) => (i === pairIndex ? { ...pair, [side]: value } : pair)))

  const inputCls =
    'min-w-0 flex-1 rounded-xl border border-white/6 bg-white/4 px-3 py-1.5 text-[0.85rem] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-600 disabled:opacity-50'

  return (
    <div className="mb-3">
      <span className="mb-1 block text-xs font-medium tracking-wide text-slate-400">
        Coppie corrette
      </span>
      <div className="flex flex-col gap-1.5">
        {pairs.map((pair, pairIndex) => (
          <div key={pairIndex} className="flex items-center gap-2">
            <input
              type="text"
              value={pair.left}
              onChange={(e) => setSide(pairIndex, 'left', e.target.value)}
              disabled={disabled}
              placeholder="Voce"
              aria-label={`Voce ${pairIndex + 1} della domanda ${index + 1}`}
              className={inputCls}
            />
            <span aria-hidden className="shrink-0 text-slate-600">
              →
            </span>
            <input
              type="text"
              value={pair.right}
              onChange={(e) => setSide(pairIndex, 'right', e.target.value)}
              disabled={disabled}
              placeholder="Abbinamento corretto"
              aria-label={`Abbinamento della voce ${pairIndex + 1} della domanda ${index + 1}`}
              className={inputCls}
            />
            {/* `wrap` perché il bottone si disabilita al minimo, e un bottone
                disabilitato non emette eventi mouse: senza involucro il
                tooltip che spiega il perché non comparirebbe. */}
            <Tooltip
              wrap
              content={
                pairs.length <= MIN_ITEMS
                  ? `Servono almeno ${MIN_ITEMS} coppie`
                  : 'Rimuovi la coppia'
              }
            >
              <button
                type="button"
                onClick={() => onChange(pairs.filter((_, i) => i !== pairIndex))}
                disabled={disabled || pairs.length <= MIN_ITEMS}
                aria-label={`Rimuovi la coppia ${pairIndex + 1} dalla domanda ${index + 1}`}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-600 transition hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-600"
              >
                <TrashIcon size={13} />
              </button>
            </Tooltip>
          </div>
        ))}
        {pairs.length < MAX_ITEMS && (
          <button
            type="button"
            onClick={() => onChange([...pairs, { left: '', right: '' }])}
            disabled={disabled}
            className="mt-0.5 flex w-fit cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-white/5 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PlusIcon size={13} />
            Aggiungi coppia
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Chi svolge il test riceve la colonna di destra in ordine sparso. Ogni voce deve avere un
        solo abbinamento corretto: se due voci hanno lo stesso, la domanda non ha una risposta certa
      </p>
    </div>
  )
}
