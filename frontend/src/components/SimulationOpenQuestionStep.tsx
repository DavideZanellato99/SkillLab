import { useState } from 'react'
import type { SimulationQuestion } from '../services/simulations'
import { textareaCls } from './Field'
import SimulationStepFooter from './SimulationStepFooter'

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
 * E siccome il tempo non conta, si può anche tornare indietro: sulla domanda
 * prima con il pulsante, su una qualsiasi già vista dalla barra in cima. Per
 * questo la risposta esce a ogni tasto e non solo quando si va avanti: chi
 * lascia la domanda da un comando che sta fuori dal riquadro, com'è la barra,
 * non passa dal pulsante, e quello che aveva scritto deve essere già arrivato
 * a chi lo tiene. Tornando, arriva in `initial` e la casella si riempie con
 * quello che c'era.
 *
 * Nessun riscontro durante il percorso: giusto e sbagliato arrivano tutti
 * insieme alla fine. E il componente non sa niente del test: riceve una
 * domanda, raccoglie una risposta e la passa a chi lo ha montato. */

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
  /** Quello che si era scritto, per chi torna su questa domanda. */
  initial?: string | null
  /** A ogni modifica: quello che ha scritto, o null se non ha scritto. */
  onChange: (text: string | null) => void
  onNext: () => void
  /** Torna alla domanda prima. Assente sulla prima domanda. */
  onBack?: () => void
}

export default function SimulationOpenQuestionStep({
  question,
  number,
  total,
  isLast,
  initial,
  onChange,
  onNext,
  onBack,
}: SimulationOpenQuestionStepProps) {
  const [text, setText] = useState(initial ?? '')

  const written = text.trim()
  const remaining = MAX_CHARS - text.length

  const write = (value: string) => {
    setText(value)
    onChange(value.trim() || null)
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
        onChange={(e) => write(e.target.value)}
        placeholder="Scrivi la tua risposta"
        // Il fuoco arriva sulla casella perché è l'unica cosa da fare in
        // questa schermata: chiedere un clic prima di poter scrivere è un
        // gesto che la pagina può risparmiare.
        autoFocus
      />

      {text.length >= COUNTER_FROM && (
        <p className="mt-1.5 text-right text-xs text-slate-500">{remaining} caratteri rimasti</p>
      )}

      <SimulationStepFooter
        hint={
          written ? undefined : 'Rispondi con parole tue, senza riprodurre il testo del manuale'
        }
        answered={Boolean(written)}
        isLast={isLast}
        onNext={onNext}
        onBack={onBack}
      />
    </div>
  )
}
