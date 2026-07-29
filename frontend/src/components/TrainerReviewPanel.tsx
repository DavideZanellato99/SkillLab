import { useState } from 'react'
import type { ConversationReview } from '../services/api'
import { deleteConversationReview, saveConversationReview } from '../services/admin'
import { hasReviewContent } from './TrainerReviewNote'
import { CloseIcon } from './icons'

/* Il modulo con cui il docente scrive la propria revisione.
 *
 * Solo il modulo: quando non si sta scrivendo, questo componente non c'è.
 * La revisione già scritta si legge dentro il blocco del punteggio
 * (TrainerReviewNote), e il comando che apre il modulo vive
 * nell'intestazione della colonna, in un posto fisso. Un riquadro sempre
 * presente in cima alla valutazione era, da vuoto, un buco nel punto più
 * visibile della pagina.
 *
 * La coppia punteggio/motivazione è obbligatoria in entrambi i versi, qui
 * come sul server: correggere un voto senza dire perché è esattamente la
 * scatola nera che questa funzione esiste per aprire. Il controllo è
 * ripetuto qui solo per dirlo prima di far partire la richiesta, la regola
 * che vale resta quella del server. */

/* La larghezza sta fuori dalla classe base: concatenare `w-[74px]` a una
 * stringa che contiene già `w-full` non la sovrascrive (in Tailwind vince
 * l'ordine nel CSS generato, non quello nella stringa), e il campo del voto
 * finiva a piena riga mandando a capo tutto il resto. */
const inputBase =
  'rounded-xl border border-white/6 bg-white/4 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-600 focus:bg-violet-600/8'
const inputCls = `${inputBase} w-full`

interface TrainerReviewPanelProps {
  conversationId: string
  review: ConversationReview | null
  /** Punteggio proposto dalla macchina, mostrato come riferimento. */
  aiScore: number | null
  onSaved: (review: ConversationReview | null) => void
  onClose: () => void
}

export default function TrainerReviewPanel({
  conversationId,
  review,
  aiScore,
  onSaved,
  onClose,
}: TrainerReviewPanelProps) {
  const written = hasReviewContent(review)
  const [summaryNote, setSummaryNote] = useState(review?.summary_note ?? '')
  const [overrideScore, setOverrideScore] = useState(
    review?.override_score != null ? String(review.override_score) : '',
  )
  const [overrideReason, setOverrideReason] = useState(review?.override_reason ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState('')

  const trimmedNote = summaryNote.trim()
  const trimmedReason = overrideReason.trim()
  const parsedScore = overrideScore.trim() === '' ? null : Number(overrideScore.replace(',', '.'))
  const scoreIsValid =
    parsedScore === null || (Number.isFinite(parsedScore) && parsedScore >= 1 && parsedScore <= 10)

  const validationError = !scoreIsValid
    ? 'Il punteggio deve essere compreso tra 1 e 10.'
    : parsedScore !== null && !trimmedReason
      ? 'Motiva la correzione del punteggio.'
      : trimmedReason && parsedScore === null
        ? 'Indica il punteggio corretto insieme alla motivazione.'
        : !trimmedNote && parsedScore === null
          ? 'Scrivi una nota o correggi il punteggio.'
          : ''

  const handleSave = async () => {
    if (validationError) {
      setError(validationError)
      return
    }
    setIsSaving(true)
    setError('')
    try {
      const updated = await saveConversationReview(conversationId, {
        summary_note: trimmedNote || null,
        override_score: parsedScore,
        override_reason: parsedScore === null ? null : trimmedReason,
      })
      onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salvataggio non riuscito.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    setError('')
    try {
      await deleteConversationReview(conversationId)
      onSaved(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eliminazione non riuscita.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-violet-500/25 bg-violet-500/8 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-violet-300">
          La tua revisione
        </span>
        <button
          className="cursor-pointer rounded-lg border-none bg-transparent p-1 text-slate-500 transition hover:bg-white/8 hover:text-slate-100"
          onClick={onClose}
          aria-label="Chiudi la revisione"
        >
          <CloseIcon size={15} />
        </button>
      </div>

      <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="review-note">
        Nota di sintesi
      </label>
      <textarea
        id="review-note"
        className={`${inputCls} mb-3 min-h-[80px] resize-y`}
        value={summaryNote}
        onChange={(e) => setSummaryNote(e.target.value)}
        placeholder="Cosa ha funzionato, cosa rifare la prossima volta..."
      />

      {/* Il voto sta su una riga sua, in linea con la sua etichetta: un
          campo numerico da tre caratteri messo di fianco a un'area di testo
          produce due riquadri di altezza diversa che non si allineano con
          niente. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <label className="text-xs font-medium text-slate-400" htmlFor="review-score">
          Voto corretto
        </label>
        <input
          id="review-score"
          className={`${inputBase} w-[74px] text-center`}
          type="number"
          min={1}
          max={10}
          step={0.5}
          value={overrideScore}
          onChange={(e) => setOverrideScore(e.target.value)}
          placeholder="—"
        />
        <span className="text-xs text-slate-500">/ 10</span>
        <span className="min-w-[160px] flex-1 text-[0.72rem] text-slate-500">
          {aiScore !== null
            ? `Lascia vuoto per confermare il ${aiScore.toLocaleString('it-IT', {
                maximumFractionDigits: 1,
              })} automatico.`
            : 'Non c’è una valutazione automatica: questo sarà il solo voto.'}
        </span>
      </div>

      {/* La motivazione compare solo quando c'è un voto da motivare, invece
          di stare lì disabilitata a occupare spazio da morta. I due campi
          restano una cosa sola: il server rifiuta l'uno senza l'altro. */}
      {overrideScore.trim() !== '' && (
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="review-reason">
            Motivo della correzione
          </label>
          <textarea
            id="review-reason"
            className={`${inputCls} min-h-[68px] resize-y`}
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Perché il punteggio automatico non andava bene..."
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="cursor-pointer rounded-xl border-none bg-gradient-to-br from-violet-600 to-cyan-500 px-5 py-2 text-sm font-semibold text-white transition hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(124,58,237,0.35)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          onClick={handleSave}
          disabled={isSaving || isDeleting}
        >
          {isSaving ? 'Salvataggio...' : 'Salva revisione'}
        </button>
        {written && (
          <button
            className="ml-auto cursor-pointer rounded-xl border-none bg-transparent px-3 py-2 text-sm font-medium text-slate-400 transition hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleDelete}
            disabled={isSaving || isDeleting}
          >
            {isDeleting ? 'Eliminazione...' : 'Elimina'}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-[0.82rem] text-red-400">{error}</p>}
    </div>
  )
}
