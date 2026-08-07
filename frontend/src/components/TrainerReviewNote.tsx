import type { ConversationReview } from '../services/api'
import { hasReviewContent } from './trainerReview'

/* La voce del docente dentro il blocco del punteggio, non accanto.
 *
 * Una revisione non è un secondo verdetto da mettere in un riquadro suo:
 * è il punteggio complessivo, motivato. Tenerla separata costringeva a
 * ripetere il numero corretto due volte a mezzo schermo di distanza, e
 * metteva la correzione sopra il voto che corregge.
 *
 * Qui compare quindi sotto la sintesi dell'AI, staccata da un filo: la
 * legge lo studente nella propria pagella e il docente nel dettaglio
 * conversazione, identica, perché una correzione che lo studente non può
 * leggere non protegge nessuno.
 *
 * Il numero corretto non si ripete: lo dice già il punteggio grande sopra.
 * Le annotazioni sui messaggi nemmeno: vivono attaccate alla riga di cui
 * parlano, l'unico posto in cui insegnano qualcosa. */

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default function TrainerReviewNote({ review }: { review: ConversationReview }) {
  if (!hasReviewContent(review)) return null

  return (
    <div className="mt-4 w-full border-t border-white/8 px-6 pt-4 text-left">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-violet-300">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          {review.reviewer_name}
        </span>
        <span className="text-[0.7rem] text-slate-500">{formatDate(review.updated_at)}</span>
      </div>

      {review.override_reason && (
        <p className="mb-1.5 text-[0.82rem] leading-relaxed text-slate-300">
          <span className="font-semibold text-slate-200">Motivo della correzione: </span>
          {review.override_reason}
        </p>
      )}

      {review.summary_note && (
        <p className="whitespace-pre-wrap text-[0.82rem] leading-relaxed text-slate-400">
          {review.summary_note}
        </p>
      )}

      {/* La valutazione AI è stata rigenerata dopo la revisione: il numero di
          cui il docente parlava non è più quello a schermo, e dirlo è più
          onesto che far passare la correzione per attuale. */}
      {review.is_stale && (
        <p className="mt-2.5 rounded-lg border border-orange-500/25 bg-orange-500/10 px-3 py-1.5 text-[0.75rem] text-orange-300">
          La valutazione automatica è stata rigenerata dopo questa revisione: il docente commentava
          un punteggio diverso da quello mostrato ora.
        </p>
      )}
    </div>
  )
}
