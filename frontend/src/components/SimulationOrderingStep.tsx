import { useState } from 'react'
import type { SimulationQuestion } from '../services/simulations'
import MoveControls, { moved } from './MoveControls'
import PrimaryButton from './PrimaryButton'

/* Una domanda di ordinamento: i passi arrivano mescolati e si rimettono in
 * fila.
 *
 * Senza cronometro, come le risposte aperte e per la stessa ragione: trenta
 * secondi bastano a scegliere una lettera, non a leggere sei passi e
 * disporli, e un tempo che scorre premierebbe chi tira a indovinare invece di
 * chi conosce la procedura. Qui i punti sono la quota di passi al posto
 * giusto, quindi ricontrollare prima di andare avanti non costa niente ed è
 * anzi la cosa giusta da fare.
 *
 * L'ordine di partenza è quello in cui il server li ha mandati, e non si
 * tocca: rimescolarlo qui vorrebbe dire che ricaricare la pagina cambia la
 * domanda, e la mescolata è già avvenuta una volta, dove la chiave viveva.
 *
 * Come sugli altri passi, nessun riscontro durante il percorso e nessun
 * ritorno indietro: giusto e sbagliato arrivano tutti insieme alla fine. E
 * come là, il componente non sa niente del test: riceve una domanda,
 * raccoglie una risposta e la consegna. */

interface SimulationOrderingStepProps {
  question: SimulationQuestion
  /** La posizione nel test, da 1, come si legge a schermo. */
  number: number
  total: number
  isLast: boolean
  /** La domanda è finita: i passi nell'ordine scelto, o null se non li ha
   *  toccati. */
  onAnswer: (steps: string[] | null) => void
}

export default function SimulationOrderingStep({
  question,
  number,
  total,
  isLast,
  onAnswer,
}: SimulationOrderingStepProps) {
  const [steps, setSteps] = useState(question.steps)
  /* Se ha toccato l'ordine o no. Consegnare la sequenza così com'era
   * arrivata è una risposta legittima, quindi non basta confrontarla con
   * quella di partenza: chi non tocca niente sta saltando la domanda, e il
   * pulsante deve dirlo. */
  const [touched, setTouched] = useState(false)

  const move = (from: number, to: number) => {
    setSteps((prev) => moved(prev, from, to))
    setTouched(true)
  }

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
        Disponi i passi nella sequenza corretta. Il punteggio è proporzionale ai passi collocati al
        posto giusto
      </p>

      <ol className="flex list-none flex-col gap-1.5">
        {steps.map((step, index) => (
          /* La chiave è il testo del passo e non la posizione: usando
             l'indice, spostare una riga farebbe reagire React come se fosse
             cambiato il testo di due righe invece dell'ordine di una. */
          <li
            key={step}
            className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/4 py-2 pl-3 pr-2"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-violet-600/30 bg-violet-600/10 text-xs font-bold text-violet-400">
              {index + 1}
            </span>
            <span className="flex-1 text-[0.92rem] leading-snug text-slate-100">{step}</span>
            <MoveControls
              label={step}
              onUp={() => move(index, index - 1)}
              onDown={() => move(index, index + 1)}
              canMoveUp={index > 0}
              canMoveDown={index < steps.length - 1}
            />
          </li>
        ))}
      </ol>

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/6 pt-5">
        <span className="text-xs text-slate-500">
          {touched
            ? "Proseguendo l'ordine viene confermato e non è più modificabile"
            : 'Sposta i passi con le frecce, dal primo da eseguire'}
        </span>
        <PrimaryButton onClick={() => onAnswer(touched ? steps : null)}>
          {isLast ? 'Consegna il test' : touched ? 'Avanti' : 'Salta la domanda'}
        </PrimaryButton>
      </div>
    </div>
  )
}
