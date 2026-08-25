import { useState } from 'react'
import type { SimulationQuestion } from '../services/simulations'
import { textareaCls } from './Field'
import PrimaryButton from './PrimaryButton'

/* Una domanda a risposta aperta: si scrive, e si va avanti quando si è
 * finito.
 *
 * Il gemello di `SimulationQuestionStep` senza il cronometro, ed è la
 * differenza che conta. Trenta secondi bastano a scegliere una lettera, non a
 * scrivere una procedura, e un tempo che scorre mentre si compone una risposta
 * premierebbe chi scrive in fretta invece di chi conosce il lavoro. Qui il
 * punteggio dipende solo da quanto la risposta è completa, quindi rileggersi
 * prima di consegnare non costa niente ed è anzi la cosa giusta da fare.
 *
 * Come sull'altro passo, nessun riscontro durante il percorso e nessun ritorno
 * indietro: giusto e sbagliato arrivano tutti insieme alla fine. E come là, il
 * componente non sa niente del test: riceve una domanda, raccoglie una
 * risposta e la consegna. */

/** Quanto si può scrivere, lo stesso tetto che il server accetta. */
const MAX_CHARS = 5000

/* Da qui in giù si vede quanto spazio resta. Prima non serve: nessuno scrive
 * quattromila caratteri in una risposta a una domanda di procedura, e un
 * contatore sempre a schermo suggerirebbe che la lunghezza conta. */
const COUNTER_FROM = MAX_CHARS - 500

interface SimulationOpenQuestionStepProps {
  question: SimulationQuestion
  /** La posizione nel test, da 1, come si legge a schermo. */
  number: number
  total: number
  isLast: boolean
  /** La domanda è finita: quello che ha scritto, o null se non ha scritto. */
  onAnswer: (text: string | null) => void
}

export default function SimulationOpenQuestionStep({
  question,
  number,
  total,
  isLast,
  onAnswer,
}: SimulationOpenQuestionStepProps) {
  const [text, setText] = useState('')

  const written = text.trim()
  const remaining = MAX_CHARS - text.length

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

      <label
        className="mb-4 block text-[1.05rem] font-medium leading-relaxed text-slate-100"
        htmlFor={`answer-${question.id}`}
      >
        {question.text}
      </label>

      <textarea
        id={`answer-${question.id}`}
        className={textareaCls}
        rows={7}
        value={text}
        maxLength={MAX_CHARS}
        onChange={(e) => setText(e.target.value)}
        placeholder="Scrivi la tua risposta"
        // Il fuoco arriva sulla casella perché è l'unica cosa da fare in
        // questa schermata: chiedere un clic prima di poter scrivere è un
        // gesto che la pagina può risparmiare.
        autoFocus
      />

      {text.length >= COUNTER_FROM && (
        <p className="mt-1.5 text-right text-xs text-slate-500">{remaining} caratteri rimasti</p>
      )}

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/6 pt-5">
        <span className="text-xs text-slate-500">
          {written
            ? 'Proseguendo la risposta viene confermata e non è più modificabile'
            : 'Rispondi con parole tue, senza riprodurre il testo del manuale'}
        </span>
        <PrimaryButton onClick={() => onAnswer(written || null)}>
          {isLast ? 'Consegna il Test' : written ? 'Avanti' : 'Salta la Domanda'}
        </PrimaryButton>
      </div>
    </div>
  )
}
