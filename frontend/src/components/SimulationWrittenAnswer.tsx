import type { SimulationAnswerResult } from '../services/simulations'

/* Com'è andata una risposta scritta: quello che ha risposto, cosa doveva
 * dire, e cosa gli è mancato.
 *
 * Le tre cose stanno insieme e in quest'ordine apposta. Su una domanda a
 * scelta multipla il voto si verifica da solo, l'alternativa giusta è lì e o
 * era quella o non lo era; su una aperta il voto lo ha dato un modello che ha
 * letto un testo, quindi chi lo riceve deve poter vedere il metro con cui è
 * stato misurato. La traccia della risposta attesa è quel metro, ed è la
 * stessa che il modello aveva davanti: senza, un 0,6 sarebbe una parola
 * dell'autorità e non una correzione.
 *
 * Il commento viene per ultimo perché è l'unica parte scritta per chi legge,
 * e si legge dopo aver visto le altre due. */

export default function SimulationWrittenAnswer({
  answer,
  own,
}: {
  answer: SimulationAnswerResult
  own: boolean
}) {
  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="rounded-xl border border-white/6 bg-white/2 px-4 py-3">
        <p className="mb-1 text-xs font-semibold tracking-wide text-slate-400">
          {own ? 'La tua risposta' : 'Risposta data'}
        </p>
        {answer.answer_text ? (
          <p className="whitespace-pre-line text-[0.85rem] leading-relaxed text-slate-200">
            {answer.answer_text}
          </p>
        ) : (
          <p className="text-[0.85rem] italic text-slate-500">
            {own ? 'Hai lasciato questa domanda in bianco.' : 'Domanda lasciata in bianco.'}
          </p>
        )}
      </div>

      {answer.expected_answer && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3">
          <p className="mb-1 text-xs font-semibold tracking-wide text-emerald-400/80">
            Cosa doveva dire
          </p>
          <p className="whitespace-pre-line text-[0.85rem] leading-relaxed text-emerald-100/90">
            {answer.expected_answer}
          </p>
        </div>
      )}

      {answer.feedback && (
        <div className="rounded-xl border border-white/6 bg-white/3 px-4 py-3">
          <p className="mb-1 text-xs font-semibold tracking-wide text-slate-400">La correzione</p>
          <p className="text-[0.85rem] leading-relaxed text-slate-300">{answer.feedback}</p>
        </div>
      )}
    </div>
  )
}
