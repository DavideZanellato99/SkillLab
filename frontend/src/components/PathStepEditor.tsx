import { useId } from 'react'

import type { AssignableContent, StepKind } from '../services/training'
import KebabMenu from './KebabMenu'
import type { KebabMenuItem } from './KebabMenu'
import SearchSelect from './SearchSelect'
import Tooltip from './Tooltip'
import { ChevronDownIcon, ChevronUpIcon, InfoIcon, TrashIcon } from './icons'
import { formInputCls, labelCls } from './Field'
import type { PathStepDraft } from './pathStepDraft'
import { draftTarget } from './pathStepDraft'

/* Una tappa mentre la si compone: cosa chiede, a chi, con che obiettivo ed
 * entro quando.
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
 * La scadenza è facoltativa ed è una data con l'ora, sul calendario: vale
 * per chiunque percorra il percorso e corre anche mentre la tappa è ancora
 * chiusa, quindi un percorso vecchio va ridatato prima di affidarlo di nuovo
 * (vedi il backend, `TrainingPathStep`).
 *
 * Le tappe sono righe di una tabella e non schede una sotto l'altra: sono
 * tutte fatte delle stesse quattro cose, e in colonne allineate si leggono
 * tenendo l'occhio fermo. Le intestazioni stanno in cima una volta sola
 * (`PathStepsHeader`), quindi le righe non ripetono nessuna etichetta e le
 * azioni di riga si raccolgono in un menu, che di larghezza ne chiede una
 * colonna sola.
 *
 * Sotto i 1024px le colonne non ci starebbero: la riga torna a essere una
 * scheda impilata e le etichette dei campi ricompaiono, visto che lì
 * l'intestazione non c'è. È lo stesso markup, riordinato da `lg:contents`. */

const KINDS = [
  { value: 'avatar', label: 'Conversazione' },
  { value: 'simulation', label: 'Test Tecnico' },
] as const

const kindBtnCls =
  'cursor-pointer rounded-lg border-none px-2.5 py-1 text-[0.75rem] font-medium transition disabled:cursor-not-allowed disabled:opacity-50'

/* Le colonne della tabella, in un posto solo perché l'intestazione e le righe
 * si disallineerebbero al primo che qualcuno ritocca senza toccare l'altra. */
const gridCls =
  'lg:grid lg:grid-cols-[1.75rem_13.25rem_minmax(0,1fr)_5.5rem_11rem_2rem] lg:items-center lg:gap-3'

/** Le intestazioni delle colonne, che le righe non ripetono. */
export function PathStepsHeader() {
  return (
    <div className={`hidden pb-1 ${gridCls}`}>
      <span />
      <span className={labelCls}>Tipo</span>
      <span className={labelCls}>Bersaglio</span>
      <span className={labelCls}>Obiettivo</span>
      <span className={`flex items-center gap-1 ${labelCls}`}>
        Entro
        <Tooltip content="Facoltativa: senza data la tappa non scade. L'ora è quella locale.">
          <span tabIndex={0} className="cursor-help text-slate-500 outline-none">
            <InfoIcon size={12} />
          </span>
        </Tooltip>
      </span>
      <span />
    </div>
  )
}

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
  // Le tappe sono più d'una nella stessa finestra: gli id dei campi devono
  // essere diversi, o l'etichetta di una punterebbe al campo di un'altra.
  const fieldId = useId()

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

  const menuItems: KebabMenuItem[] = [
    {
      key: 'up',
      label: 'Sposta in Alto',
      icon: <ChevronUpIcon />,
      onSelect: () => onMove(index - 1),
      disabled: disabled || index === 0,
      disabledReason: index === 0 ? 'È già la prima tappa' : undefined,
    },
    {
      key: 'down',
      label: 'Sposta in Basso',
      icon: <ChevronDownIcon />,
      onSelect: () => onMove(index + 1),
      disabled: disabled || index === total - 1,
      disabledReason: index === total - 1 ? 'È già l’ultima tappa' : undefined,
    },
    {
      key: 'remove',
      label: 'Rimuovi la Tappa',
      icon: <TrashIcon />,
      danger: true,
      onSelect: onRemove,
      disabled: disabled || total <= 1,
      disabledReason: total <= 1 ? 'Un percorso ha almeno una tappa' : undefined,
    },
  ]

  return (
    <li
      className={`flex flex-col gap-2 rounded-xl border border-white/6 bg-gray-950/40 p-3 ${gridCls} lg:rounded-none lg:border-x-0 lg:border-b lg:border-t-0 lg:border-white/6 lg:bg-transparent lg:p-0 lg:py-2 lg:last:border-b-0`}
    >
      <div className="flex items-center gap-2 lg:contents">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-violet-600/30 bg-violet-600/10 text-xs font-bold tabular-nums text-violet-400">
          {index + 1}
        </span>
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
      </div>

      <SearchSelect
        value={targetValue}
        onChange={setTarget}
        options={options}
        variant="field"
        placeholder={kind === 'avatar' ? 'Cerca un avatar...' : 'Cerca un test...'}
      />

      <div className="flex items-end gap-2 lg:contents">
        <div className="flex flex-1 flex-col gap-1 lg:block">
          {/* L'etichetta è quella della colonna, che sopra i 1024px sta in
              cima alla tabella: qui resta per chi legge la scheda impilata,
              e l'`aria-label` la sostituisce quando è nascosta. */}
          <label htmlFor={`${fieldId}-score`} className={`${labelCls} lg:hidden`}>
            Obiettivo (1-10)
          </label>
          <input
            id={`${fieldId}-score`}
            type="number"
            min={1}
            max={10}
            step={0.5}
            disabled={disabled}
            aria-label="Obiettivo (1-10)"
            value={step.targetScore}
            onChange={(e) => onChange({ ...step, targetScore: Number(e.target.value) })}
            className={`${formInputCls} w-full`}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1 lg:block">
          <label htmlFor={`${fieldId}-due`} className={`${labelCls} lg:hidden`}>
            Da Completare Entro
          </label>
          <input
            id={`${fieldId}-due`}
            type="datetime-local"
            disabled={disabled}
            aria-label="Da Completare Entro"
            value={step.dueAt ?? ''}
            onChange={(e) => onChange({ ...step, dueAt: e.target.value || null })}
            className={`${formInputCls} w-full`}
          />
        </div>
        <Tooltip wrap content="Altre azioni">
          <KebabMenu label={`Azioni della tappa ${index + 1}`} items={menuItems} />
        </Tooltip>
      </div>
    </li>
  )
}
