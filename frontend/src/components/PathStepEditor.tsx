import { useId } from 'react'
import type { ReactNode } from 'react'

import type { AssignableContent, StepKind } from '../services/training'
import KebabMenu from './KebabMenu'
import type { KebabMenuItem } from './KebabMenu'
import NumberInput from './NumberInput'
import PathStepCriteria from './PathStepCriteria'
import SearchSelect from './SearchSelect'
import Tooltip from './Tooltip'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  InfoIcon,
  SlidersIcon,
  SparkleIcon,
  TrashIcon,
} from './icons'
import { formInputCls, labelCls } from './Field'
import type { PathStepDraft } from './pathStepDraft'
import { draftTarget, withCriterionTarget } from './pathStepDraft'

/* Una tappa mentre la si compone: cosa chiede, a chi, con che obiettivo ed
 * entro quando.
 *
 * **Due file dentro la stessa scheda**: sopra chi è la tappa (il numero, il
 * tipo di prova, il bersaglio), sotto cosa chiede (l'obiettivo, i criteri, la
 * scadenza). Prima era una riga di tabella a sette colonne, e non ci stava:
 * la finestra è larga 860px e le colonne fisse ne prendevano seicento, quindi
 * al bersaglio, che è la cosa più importante della tappa, ne restavano meno
 * di duecento e i nomi ci finivano dentro a capo. Adesso il bersaglio ha una
 * fila tutta sua, e i campi corti stanno insieme sotto, dove la larghezza che
 * serve loro è quella che hanno.
 *
 * Con le due file tornano le etichette accanto ai campi, e se ne va
 * l'intestazione di colonne che stava in cima all'elenco: una fila di campi
 * che va a capo non si allinea a nessuna intestazione, e leggere "Obiettivo"
 * accanto al campo costa meno che risalire in cima a cercarlo. Se ne va anche
 * il doppio impaginato, uno per schermo largo e uno per schermo stretto:
 * questo regge tutte e due da solo.
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
 * Accanto all'obiettivo, su una tappa di conversazione, c'è il bottone che
 * apre le soglie sui singoli criteri (`PathStepCriteria`). Sta chiuso e non
 * aperto perché quasi nessuna tappa ne pone: sei campi in più su ogni tappa
 * direbbero che vanno riempiti. Quando ce ne sono, il bottone porta il loro
 * numero, così una tappa con delle condizioni si riconosce anche a pannello
 * chiuso. Su un test tecnico il bottone non c'è: un test non si valuta per
 * criteri, si consegna.
 *
 * Una tappa arrivata da una proposta porta in fondo il perché il modello
 * l'ha messa lì. Sparisce appena il bersaglio o il tipo cambiano, perché da
 * quel momento sarebbe la didascalia di una tappa che nessuno ha proposto. */

const KINDS = [
  { value: 'avatar', label: 'Conversazione' },
  { value: 'simulation', label: 'Test Tecnico' },
] as const

const kindBtnCls =
  'cursor-pointer rounded-lg border-none px-2.5 py-1 text-[0.75rem] font-medium transition disabled:cursor-not-allowed disabled:opacity-50'

/** Un campo della fila di sotto: l'etichetta sopra, il campo largo quanto serve. */
function StepField({
  label,
  htmlFor,
  children,
}: {
  label: ReactNode
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className={labelCls}>
        {label}
      </label>
      {children}
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

  // La motivazione parlava della prova che c'era prima: cambiando tipo o
  // bersaglio non spiega più niente, e se ne va con la scelta che spiegava.
  const setKind = (next: StepKind) => {
    if (next !== kind) onChange({ ...step, kind: next, reason: null })
  }

  const setTarget = (value: string) =>
    onChange(
      kind === 'avatar'
        ? { ...step, avatarId: value || null, reason: null }
        : { ...step, simulationId: value || null, reason: null },
    )

  // Le soglie restano dove sono quando il pannello si chiude: chiuderlo è
  // smettere di guardarle, non toglierle. A dire che ci sono resta il numero
  // sul bottone.
  const criteriaCount = Object.keys(step.criteriaTargets).length
  const showCriteria = kind === 'avatar' && step.criteriaOpen

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
    <li className="flex flex-col gap-2.5 rounded-xl border border-white/6 bg-gray-950/40 p-3">
      {/* Chi è la tappa: il posto nella fila, che prova chiede, e il menu con
          cui si sposta o si toglie. */}
      <div className="flex items-center gap-2">
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
        <span className="flex-1" />
        <Tooltip wrap content="Altre azioni">
          <KebabMenu label={`Azioni della tappa ${index + 1}`} items={menuItems} />
        </Tooltip>
      </div>

      {/* Il bersaglio si prende la fila intera: è il campo su cui si cerca, e
          due avatar dello stesso reparto si distinguono per l'ultima parola
          del nome. */}
      <StepField label="Bersaglio">
        <SearchSelect
          value={targetValue}
          onChange={setTarget}
          options={options}
          variant="field"
          placeholder={kind === 'avatar' ? 'Cerca un avatar...' : 'Cerca un test...'}
        />
      </StepField>

      {/* Cosa chiede la tappa. I campi vanno a capo su schermo stretto invece
          di stringersi, perché un campo data stretto non si legge. */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2.5">
        <StepField label="Obiettivo (1-10)" htmlFor={`${fieldId}-score`}>
          <NumberInput
            id={`${fieldId}-score`}
            min={1}
            max={10}
            step={0.5}
            disabled={disabled}
            value={step.targetScore}
            onValueChange={(value) => onChange({ ...step, targetScore: Number(value) })}
            wrapperClassName="w-24"
            className={`w-full pr-6 pl-6 text-center ${formInputCls}`}
          />
        </StepField>

        {kind === 'avatar' && (
          <StepField label="Criteri">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...step, criteriaOpen: !step.criteriaOpen })}
              aria-expanded={step.criteriaOpen}
              aria-label={`Obiettivi per criterio della tappa ${index + 1}`}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[0.8rem] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                criteriaCount > 0 || step.criteriaOpen
                  ? 'border-violet-600/30 bg-violet-600/10 text-violet-300 hover:bg-violet-600/20'
                  : 'border-white/6 bg-slate-800/50 text-slate-400 hover:border-white/12 hover:text-slate-200'
              }`}
            >
              <SlidersIcon size={14} />
              Obiettivi per criterio
              {criteriaCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[0.6rem] font-bold tabular-nums text-white">
                  {criteriaCount}
                </span>
              )}
            </button>
          </StepField>
        )}

        <StepField
          label={
            <span className="flex items-center gap-1">
              Da completare entro
              <Tooltip content="Facoltativa, senza data la tappa non scade">
                <span tabIndex={0} className="cursor-help text-slate-500 outline-none">
                  <InfoIcon size={12} />
                </span>
              </Tooltip>
            </span>
          }
          htmlFor={`${fieldId}-due`}
        >
          <input
            id={`${fieldId}-due`}
            type="datetime-local"
            disabled={disabled}
            value={step.dueAt ?? ''}
            onChange={(e) => onChange({ ...step, dueAt: e.target.value || null })}
            className={`min-w-[13rem] ${formInputCls}`}
          />
        </StepField>
      </div>

      {showCriteria && (
        <PathStepCriteria
          criteria={content.criteria}
          targets={step.criteriaTargets}
          disabled={disabled}
          onChange={(key, value) => onChange(withCriterionTarget(step, key, value))}
        />
      )}

      {step.reason && (
        <p className="flex gap-1.5 text-[0.72rem] leading-relaxed text-violet-300/70">
          <span className="mt-0.5 shrink-0">
            <SparkleIcon size={12} />
          </span>
          <span>{step.reason}</span>
        </p>
      )}
    </li>
  )
}
