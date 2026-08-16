import FilterTabs from './FilterTabs'
import Select from './Select'
import type { SelectOption } from './Select'

/* La riga con cui si restringe il confronto, in cima a ciascuna delle due
 * metà.
 *
 * Sempre due filtri, e nello stesso ordine: prima la specie della prova, che
 * ha poche voci fisse e si sceglie a linguette perché quella scelta si legge
 * senza aprire niente; poi il bersaglio, che è un elenco lungo quanto le cose
 * fatte da quella persona e sta in una tendina. Il secondo dipende dal primo
 * (vedi `survivingFilter`), quindi si legge nell'ordine in cui si compone.
 *
 * Le due metà passano cose diverse dentro la stessa forma: canale e scenario
 * da una parte, tipo di test e test dall'altra. Il componente non le conosce,
 * e questo è il punto: sono la stessa barra, e devono restare uguali. */

interface ComparisonFilterBarProps<F extends string> {
  /** Cosa sceglie il gruppo di linguette: "Modalità", "Tipo di Test". */
  kindLabel: string
  kindValue: F
  kindOptions: { value: F; label: string }[]
  onKindChange: (value: F) => void
  /** Serve a legare la label alla tendina, e le due metà convivono nella stessa pagina. */
  targetId: string
  /** Cosa sceglie la tendina: "Scenario", "Test". */
  targetLabel: string
  targetValue: string
  targetOptions: SelectOption[]
  onTargetChange: (value: string) => void
}

export default function ComparisonFilterBar<F extends string>({
  kindLabel,
  kindValue,
  kindOptions,
  onKindChange,
  targetId,
  targetLabel,
  targetValue,
  targetOptions,
  onTargetChange,
}: ComparisonFilterBarProps<F>) {
  return (
    /* Il filetto sotto separa il restringere dallo scegliere: sopra si decide
       quali prove esistono per questo confronto, sotto quali due si guardano.
       Sono due gesti diversi e la riga lo dice senza scriverlo. */
    <div className="mb-5 flex flex-wrap items-end gap-4 border-b border-white/6 pb-5">
      <div>
        <span className="mb-1 block text-xs font-medium text-slate-400">{kindLabel}</span>
        <FilterTabs
          value={kindValue}
          onChange={onKindChange}
          options={kindOptions}
          ariaLabel={kindLabel}
        />
      </div>
      <div className="min-w-[240px] flex-1">
        <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor={targetId}>
          {targetLabel}
        </label>
        <Select
          id={targetId}
          value={targetValue}
          onChange={onTargetChange}
          options={targetOptions}
        />
      </div>
    </div>
  )
}

/**
 * Quello che resta da dire quando due prove scelte non sono della stessa
 * specie.
 *
 * I filtri partono aperti, perché nasconderne di default metà a chi arriva
 * sarebbe una risposta incompleta a "cosa ho fatto": chi vuole può ancora
 * affiancare una telefonata e una chat, e in quel caso l'avviso dice cosa sta
 * guardando invece di impedirglielo. Più avvisi insieme sono più righe: due
 * prove possono essere diverse per due ragioni alla volta, e la seconda non
 * deve sparire dietro la prima.
 */
export function ComparisonWarnings({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null
  return (
    <div className="mt-4 flex flex-col gap-2">
      {messages.map((message) => (
        <p
          key={message}
          className="rounded-xl border border-orange-500/25 bg-orange-500/10 px-4 py-2 text-[0.8rem] text-orange-300"
        >
          {message}
        </p>
      ))}
    </div>
  )
}
