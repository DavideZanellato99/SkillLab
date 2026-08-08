import type { AssignableContent, StepKind } from '../services/training'
import MoveControls from './MoveControls'
import SearchSelect from './SearchSelect'
import Tooltip from './Tooltip'
import { TrashIcon } from './icons'
import { cardInputCls } from './Field'
import type { PathStepDraft } from './pathStepDraft'
import { draftTarget } from './pathStepDraft'

/* Una tappa mentre la si compone: cosa chiede, a chi, con che obiettivo e in
 * quanti giorni.
 *
 * Il tipo si sceglie prima del bersaglio e non dopo, perché è quello che
 * decide fra quali cose si sta cercando: un elenco unico di avatar e test
 * mescolati costringerebbe a leggere ogni voce per capire cosa sia. Vive nel
 * dato della bozza e non si deduce dagli id (vedi `pathStepDraft`): appena si
 * cambia tipo il bersaglio non c'è ancora, e dedurlo lo farebbe tornare
 * indietro da solo.
 *
 * Cambiare tipo non butta la scelta fatta nell'altro: chi torna su
 * "conversazione" ritrova l'avatar che aveva già scelto, e al salvataggio
 * parte comunque il solo bersaglio del tipo attivo.
 *
 * I giorni sono facoltativi e sono giorni, non una data: partono da quando la
 * tappa si sblocca, e quando succederà dipende da quanto ci mette chi la sta
 * percorrendo (vedi il backend, ``TrainingPathStep``). */

const KINDS = [
  { value: 'avatar', label: 'Conversazione' },
  { value: 'simulation', label: 'Test tecnico' },
] as const

const kindBtnCls =
  'cursor-pointer rounded-lg border-none px-3 py-1 text-[0.78rem] font-medium transition disabled:cursor-not-allowed disabled:opacity-50'

export default function PathStepEditor({
  step,
  index,
  total,
  content,
  onChange,
  onMove,
  onRemove,
  disabled = false,
}: {
  step: PathStepDraft
  index: number
  total: number
  content: AssignableContent
  onChange: (step: PathStepDraft) => void
  onMove: (to: number) => void
  onRemove: () => void
  disabled?: boolean
}) {
  const kind = step.kind
  const targetValue = draftTarget(step) ?? ''

  const options =
    kind === 'avatar'
      ? content.avatars.map((a) => ({ value: a.id, label: a.name, sub: a.category }))
      : content.simulations.map((s) => ({ value: s.id, label: s.title }))

  const setKind = (next: StepKind) => {
    if (next !== kind) onChange({ ...step, kind: next })
  }

  const setTarget = (value: string) =>
    onChange(
      kind === 'avatar'
        ? { ...step, avatarId: value || null }
        : { ...step, simulationId: value || null },
    )

  return (
    <li className="flex gap-3 rounded-xl border border-white/6 bg-gray-950/40 p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-violet-600/30 bg-violet-600/10 text-xs font-bold tabular-nums text-violet-400">
        {index + 1}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-white/4 p-0.5" role="group">
          {KINDS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => setKind(option.value)}
              aria-pressed={kind === option.value}
              className={`${kindBtnCls} ${
                kind === option.value
                  ? 'bg-violet-600/20 text-slate-100'
                  : 'bg-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <SearchSelect
          value={targetValue}
          onChange={setTarget}
          options={options}
          placeholder={kind === 'avatar' ? 'Cerca un avatar...' : 'Cerca un test...'}
          emptyHint="Da scegliere"
        />

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-400">Obiettivo (1-10)</span>
            <input
              type="number"
              min={1}
              max={10}
              step={0.5}
              disabled={disabled}
              value={step.targetScore}
              onChange={(e) => onChange({ ...step, targetScore: Number(e.target.value) })}
              className={`${cardInputCls} w-[110px]`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-400">Giorni concessi</span>
            <input
              type="number"
              min={1}
              max={365}
              disabled={disabled}
              value={step.dueDays ?? ''}
              placeholder="nessuno"
              onChange={(e) =>
                onChange({ ...step, dueDays: e.target.value ? Number(e.target.value) : null })
              }
              className={`${cardInputCls} w-[130px]`}
            />
          </label>
          <span className="pb-2 text-xs text-slate-500">da quando la tappa si sblocca</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1">
        <MoveControls
          label={`tappa ${index + 1}`}
          onUp={() => onMove(index - 1)}
          onDown={() => onMove(index + 1)}
          canMoveUp={index > 0}
          canMoveDown={index < total - 1}
          disabled={disabled}
        />
        {/* `wrap` perché al minimo il bottone si disabilita, e un bottone
            disabilitato non emette eventi mouse: senza involucro il tooltip
            che spiega il perché non comparirebbe. */}
        <Tooltip wrap content={total <= 1 ? 'Un percorso ha almeno una tappa' : 'Rimuovi la tappa'}>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled || total <= 1}
            aria-label={`Rimuovi la tappa ${index + 1}`}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-600 transition hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-600"
          >
            <TrashIcon size={13} />
          </button>
        </Tooltip>
      </div>
    </li>
  )
}
