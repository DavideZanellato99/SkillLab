import { ChevronDownIcon, ChevronUpIcon } from './icons'
import Tooltip from './Tooltip'

/* Le due frecce con cui un elemento di un elenco sale o scende di un posto.
 *
 * Stanno in due posti che sembrano lontani e fanno la stessa cosa: il super
 * admin che dispone i passi di una domanda di ordinamento nella loro
 * sequenza corretta, e l'operatore che dispone gli stessi passi durante il
 * test. Un componente solo, perché il gesto è quello e due copie
 * finirebbero per disabilitarsi in modo diverso ai due capi dell'elenco.
 *
 * Le frecce e non il trascinamento: si tocca con un dito senza prendere la
 * mira, si usa con la tastiera senza sapere nessuna scorciatoia, e non
 * chiede una libreria. Un elenco lungo si riordinerebbe meglio trascinando,
 * ma qui gli elementi sono al massimo sei.
 *
 * Il tooltip compare solo dove il bottone è vivo: "non si può salire più su"
 * lo dice già la freccia spenta, e scriverlo trasformerebbe ogni capo
 * dell'elenco in un messaggio da leggere. */
export default function MoveControls({
  label,
  onUp,
  onDown,
  canMoveUp,
  canMoveDown,
  disabled = false,
}: {
  /** Cosa si sta spostando, per chi legge con uno screen reader. */
  label: string
  onUp: () => void
  onDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  disabled?: boolean
}) {
  const btnCls =
    'flex h-6 w-7 cursor-pointer items-center justify-center rounded-md text-slate-500 transition hover:bg-white/8 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-slate-500'
  return (
    <div className="flex shrink-0 flex-col">
      <Tooltip content={canMoveUp && !disabled ? 'Sposta in Alto' : ''}>
        <button
          type="button"
          onClick={onUp}
          disabled={disabled || !canMoveUp}
          aria-label={`Sposta in Alto: ${label}`}
          className={btnCls}
        >
          <ChevronUpIcon size={14} />
        </button>
      </Tooltip>
      <Tooltip content={canMoveDown && !disabled ? 'Sposta in Basso' : ''}>
        <button
          type="button"
          onClick={onDown}
          disabled={disabled || !canMoveDown}
          aria-label={`Sposta in Basso: ${label}`}
          className={btnCls}
        >
          <ChevronDownIcon size={14} />
        </button>
      </Tooltip>
    </div>
  )
}
