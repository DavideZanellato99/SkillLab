import { useState } from 'react'
import type { SimulationPair, SimulationQuestion } from '../services/simulations'
import PrimaryButton from './PrimaryButton'
import Select from './Select'

/* Una domanda di abbinamento: ogni voce di sinistra sceglie il proprio
 * abbinato fra quelli di destra, che arrivano mescolati.
 *
 * Si risponde con una tendina per riga e non trascinando, che pure si fa
 * sull'ordinamento: là i passi sono cinque e le posizioni cinque, qui lo
 * stesso abbinato si può scegliere due volte, ed è voluto (vedi sotto). Un
 * box trascinato in una casella la occupa, quindi il doppione diventerebbe
 * impossibile. La tendina è quella di tutta l'app.
 *
 * **Lo stesso abbinato si può scegliere due volte.** Impedirlo vorrebbe dire
 * togliere una voce dalle tendine che restano, e chi si accorge a metà di
 * aver sbagliato la prima si ritroverebbe la scelta giusta sparita dal menu.
 * Restano scelte sbagliate come le altre: la chiave dice che un abbinato vale
 * per una voce sola, quindi due voci uguali sono già una risposta che perde
 * punti.
 *
 * Nessuna sparizione, ma nemmeno la memoria a carico di chi risponde: con sei
 * voci ricordarsi cosa si è già usato è un lavoro che il test non sta
 * misurando. Quindi ogni tendina **dice quali abbinati sono già impegnati e
 * su quale voce**, il contatore dice quante voci mancano, e un abbinato
 * ripetuto accende le righe che se lo contendono e le nomina nell'avviso.
 * Tutto resta scegliibile: si vede il conflitto prima di crearlo, e chi lo
 * crea lo vede subito invece di scoprirlo alla correzione.
 *
 * Senza cronometro come l'ordinamento, e per la stessa ragione. Nessun
 * riscontro sulla correttezza durante il percorso e nessun ritorno indietro,
 * come su tutti gli altri passi. */

interface SimulationMatchingStepProps {
  question: SimulationQuestion
  /** La posizione nel test, da 1, come si legge a schermo. */
  number: number
  total: number
  isLast: boolean
  /** La domanda è finita: le coppie formate, o null se non ne ha formata
   *  nessuna. */
  onAnswer: (pairs: SimulationPair[] | null) => void
}

/** Un elenco come si legge, con la «e» al posto dell'ultima virgola. */
function readableList(items: string[]) {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}

export default function SimulationMatchingStep({
  question,
  number,
  total,
  isLast,
  onAnswer,
}: SimulationMatchingStepProps) {
  /* Cosa ha scelto per ogni voce di sinistra. Le voci senza scelta non
   * compaiono, ed è quello che le rende "lasciate scoperte" quando la
   * risposta parte. */
  const [chosen, setChosen] = useState<Record<string, string>>({})

  const pairs: SimulationPair[] = question.left
    .filter((left) => chosen[left])
    .map((left) => ({ left, right: chosen[left] }))

  /* A quali voci di sinistra ogni abbinato è già andato. Da qui esce tutto il
   * resto: la nota nelle tendine, le righe in conflitto e l'avviso. Più di
   * una voce sullo stesso abbinato è il duplicato. */
  const assignedTo = new Map<string, string[]>()
  for (const { left, right } of pairs) {
    assignedTo.set(right, [...(assignedTo.get(right) ?? []), left])
  }

  const repeated = [...assignedTo.entries()].filter(([, lefts]) => lefts.length > 1)
  const inConflict = new Set(repeated.flatMap(([, lefts]) => lefts))

  /* Le opzioni sono le stesse per tutte le righe, nello stesso ordine: cambia
   * solo la nota, che su una riga non parla mai di sé stessa. */
  const optionsFor = (left: string) =>
    question.right.map((right) => {
      const elsewhere = (assignedTo.get(right) ?? []).filter((other) => other !== left)
      return {
        value: right,
        label: right,
        note: elsewhere.length ? `già su ${readableList(elsewhere)}` : undefined,
      }
    })

  return (
    <div className="rounded-2xl border border-white/6 bg-gray-900/60 p-6 backdrop-blur-md">
      <div className="mb-4 flex items-center justify-between gap-4">
        <span className="text-xs font-medium tracking-wide text-slate-400">
          Domanda {number} di {total}
        </span>
        <span className="text-xs text-slate-500">
          vale fino a <span className="font-semibold text-slate-400">1</span>
        </span>
      </div>

      <p className="mb-1 text-[1.05rem] font-medium leading-relaxed text-slate-100">
        {question.text}
      </p>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xs text-slate-500">
          Associa a ogni voce il suo abbinamento. Il punteggio è proporzionale alle associazioni
          corrette
        </p>
        {/* Quante voci mancano, senza contarle a occhio. Sta accanto alla
            consegna perché è la stessa informazione vista dall'altra parte:
            cosa chiede la domanda e quanto ne è stato fatto. */}
        <span className="shrink-0 text-xs font-medium text-slate-400">
          {pairs.length} di {question.left.length} abbinate
        </span>
      </div>

      <ul className="flex list-none flex-col gap-2">
        {question.left.map((left, index) => (
          <li key={left} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            {/* La voce si accende quando il suo abbinato è finito anche
                altrove: l'avviso in fondo dice quale, ma con sei righe dice
                anche dove guardare. */}
            <span
              className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-[0.92rem] leading-snug transition ${
                inConflict.has(left)
                  ? 'border-amber-400/40 bg-amber-400/8 text-amber-100'
                  : 'border-white/6 bg-white/4 text-slate-100'
              }`}
            >
              {left}
            </span>
            <span aria-hidden className="shrink-0 text-slate-600">
              →
            </span>
            {/* Quale voce sta abbinando, e non solo che sta abbinando: le
                tendine sono una per riga e tutte con lo stesso invito, quindi
                chi le sente lette una dopo l'altra sentirebbe cinque volte la
                stessa frase senza sapere a cosa si riferisce. A schermo la
                voce è lì di fianco e basta guardarla. */}
            <Select
              id={`match-${question.id}-${index}`}
              ariaLabel={`Abbinamento per ${left}`}
              className="min-w-0 flex-1 max-sm:w-full"
              value={chosen[left] ?? ''}
              onChange={(value) => setChosen((prev) => ({ ...prev, [left]: value }))}
              options={optionsFor(left)}
              placeholder="Scegli l'abbinamento"
            />
          </li>
        ))}
      </ul>

      {repeated.length > 0 && (
        <p className="mt-2 text-xs text-amber-400/80">
          {readableList(repeated.map(([right, lefts]) => `${right} è su ${readableList(lefts)}`))}:
          ogni voce ha un solo abbinamento corretto
        </p>
      )}

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/6 pt-5">
        <span className="text-xs text-slate-500">
          {pairs.length
            ? 'Proseguendo le associazioni vengono confermate e non sono più modificabili'
            : 'Le voci lasciate senza abbinamento vengono considerate errate'}
        </span>
        <PrimaryButton onClick={() => onAnswer(pairs.length ? pairs : null)}>
          {isLast ? 'Consegna il Test' : pairs.length ? 'Avanti' : 'Salta la Domanda'}
        </PrimaryButton>
      </div>
    </div>
  )
}
