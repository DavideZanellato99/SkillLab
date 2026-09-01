import FilterTabs from './FilterTabs'
import FiltersBar, { FilterField } from './FiltersBar'
import Select from './Select'
import type { SelectOption } from './Select'

/* La riga con cui si restringe il confronto, in cima a ciascuna delle due
 * metà.
 *
 * Sempre due filtri, e nello stesso ordine: prima la specie della prova, che
 * ha poche voci fisse e si sceglie a linguette perché quella scelta si legge
 * senza aprire niente; poi il bersaglio, che è un elenco lungo quanto le cose
 * fatte da quella persona e sta in una tendina. Il secondo dipende dal primo
 * (vedi `chosenFilter`), quindi si legge nell'ordine in cui si compone.
 *
 * I due non si comportano allo stesso modo: la specie ha una voce "tutti" e
 * il bersaglio no. Guardare le chiamate e le chat insieme è una lettura
 * legittima di cosa una persona ha fatto; "tutti gli scenari" invece non
 * apriva niente, offriva coppie che non si possono leggere.
 *
 * Le due metà passano cose diverse dentro la stessa forma: canale e scenario
 * da una parte, tipo di test e test dall'altra. Il componente non le conosce,
 * e questo è il punto: sono la stessa barra, e devono restare uguali.
 *
 * Il riquadro e le due etichette sono quelli di ogni altra fascia di filtri
 * (`FiltersBar`, nella variante che porta il filetto sotto): erano scritti a
 * mano qui dentro, e nella copia le etichette avevano perso la spaziatura
 * delle altre, cioè la stessa parola in due schermate era composta in due
 * modi. */

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
    /* Il filetto sotto, che la variante `section` porta con sé, separa il
       restringere dallo scegliere: sopra si decide quali prove esistono per
       questo confronto, sotto quali due si guardano. Sono due gesti diversi e
       la riga lo dice senza scriverlo. */
    <FiltersBar variant="section">
      <FilterField label={kindLabel}>
        <FilterTabs
          value={kindValue}
          onChange={onKindChange}
          options={kindOptions}
          ariaLabel={kindLabel}
        />
      </FilterField>
      {/* La tendina si prende quello che avanza: le voci sono i nomi di
          scenari e test, che sono lunghi quanto chi li ha scritti. */}
      <FilterField label={targetLabel} htmlFor={targetId} className="min-w-[240px] flex-1">
        <Select
          id={targetId}
          value={targetValue}
          onChange={onTargetChange}
          options={targetOptions}
        />
      </FilterField>
    </FiltersBar>
  )
}

/**
 * Quello che resta da dire quando due prove scelte non sono della stessa
 * specie.
 *
 * Il filtro della specie parte aperto, perché nasconderne di default metà a
 * chi arriva sarebbe una risposta incompleta a "cosa ho fatto": chi vuole può
 * ancora affiancare una telefonata e una chat, e in quel caso l'avviso dice
 * cosa sta guardando invece di impedirglielo. Ne resta uno solo, il canale
 * delle conversazioni: due scenari diversi e due test diversi non si
 * affiancano più, e i due tentativi di uno stesso test hanno per forza lo
 * stesso tipo. L'elenco però resta un elenco, perché un avviso solo oggi non
 * vuol dire un avviso solo per sempre.
 *
 * All'apertura non ne compare nessuno: la coppia proposta è dello stesso
 * canale (vedi `resolvePair`), e un avviso che c'è sempre smette di essere
 * letto proprio in vista della volta in cui dice qualcosa.
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
