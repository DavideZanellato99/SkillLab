import type { MessageAnnotation } from '../services/api'

/* La nota che il docente ha appuntato su un messaggio, in sola lettura.
 *
 * La legge chi la riceve e non la scrive: sotto la bolla nella propria chat,
 * e sotto la stessa riga rileggendo la conversazione dal dettaglio. Chi
 * invece la scrive passa da MessageAnnotationEditor, che di questa è la
 * versione con la penna. */

export default function MessageAnnotationNote({ annotation }: { annotation: MessageAnnotation }) {
  return (
    <div className="mt-1.5 rounded-xl border border-violet-500/25 bg-violet-500/8 px-3 py-2">
      <span className="mb-0.5 block text-[0.68rem] font-semibold uppercase tracking-wide text-violet-300">
        Nota di {annotation.reviewer_name}
      </span>
      <p className="whitespace-pre-wrap break-words text-[0.8rem] leading-relaxed text-slate-300">
        {annotation.note}
      </p>
    </div>
  )
}
