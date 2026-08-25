import { useState } from 'react'
import type { SimulationPair, SimulationQuestion } from '../services/simulations'
import PrimaryButton from './PrimaryButton'
import Select from './Select'

/* Una domanda di abbinamento: ogni voce di sinistra sceglie il proprio
 * abbinato fra quelli di destra, che arrivano mescolati.
 *
 * Si risponde con una tendina per riga e non trascinando: si usa con un dito
 * senza prendere la mira, si usa con la tastiera senza sapere nessuna
 * scorciatoia, e non chiede una libreria a un'applicazione che dopo il primo
 * deploy non si tocca più. La tendina è quella di tutta l'app.
 *
 * **Lo stesso abbinato si può scegliere due volte.** Impedirlo vorrebbe dire
 * togliere una voce dalle tendine che restano, e chi si accorge a metà di
 * aver sbagliato la prima si ritroverebbe la scelta giusta sparita dal menu.
 * Restano scelte sbagliate come le altre, con un avviso che le fa notare
 * senza bloccare niente: la chiave dice che un abbinato vale per una voce
 * sola, quindi due voci uguali sono già una risposta che perde punti.
 *
 * Senza cronometro come l'ordinamento, e per la stessa ragione. Nessun
 * riscontro durante il percorso e nessun ritorno indietro, come su tutti gli
 * altri passi. */

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

  const options = question.right.map((right) => ({ value: right, label: right }))
  const pairs: SimulationPair[] = question.left
    .filter((left) => chosen[left])
    .map((left) => ({ left, right: chosen[left] }))

  const used = pairs.map((p) => p.right)
  const repeated = new Set(used).size !== used.length

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
      <p className="mb-4 text-xs text-slate-500">
        Associa a ogni voce il suo abbinamento. Il punteggio è proporzionale alle associazioni
        corrette
      </p>

      <ul className="flex list-none flex-col gap-2">
        {question.left.map((left, index) => (
          <li key={left} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <span className="min-w-0 flex-1 rounded-xl border border-white/6 bg-white/4 px-3 py-2 text-[0.92rem] leading-snug text-slate-100">
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
              options={options}
              placeholder="Scegli l'abbinamento"
            />
          </li>
        ))}
      </ul>

      {repeated && (
        <p className="mt-2 text-xs text-amber-400/80">
          Lo stesso abbinamento è stato assegnato a più voci: ogni voce ne ha uno solo corretto
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
