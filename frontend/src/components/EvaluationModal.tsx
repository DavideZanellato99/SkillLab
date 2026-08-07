import { useEffect, useRef, useState } from 'react'
import type { ConversationEvaluation, EvaluationCitation } from '../services/api'
import { fetchEvaluationPdf } from '../services/api'
import EvaluationReport from './EvaluationReport'
import PdfDownloadButton from './PdfDownloadButton'
import Spinner from './Spinner'
import ModalShell from './ModalShell'
import LoadingState from './LoadingState'

/* Post-call evaluation modal: overall score, per-criterion scores and
 * improvement suggestions (present only where the score is below 8).
 *
 * Right after a call it also offers to rename the conversation. The name is
 * mandatory but never missing: it is assigned automatically when the call
 * starts, so this is a chance to replace it, not a blocking step.
 *
 * The only moment with no way out is while the evaluation is being generated:
 * the modal unlocks as soon as there is something to read. */

interface EvaluationModalProps {
  avatarName: string
  evaluation: ConversationEvaluation | null
  isLoading: boolean
  error: string | null
  onRetry: () => void
  onClose: () => void
  /** Post-call: offers to rename the conversation, prefilled with its
   *  automatic name. Absent outside the post-call flow. */
  currentTitle?: string | null
  onSubmitTitle?: (title: string) => void
  isSavingTitle?: boolean
  titleError?: string | null
  /** Chip dei momenti citati dalla valutazione: chi le riceve chiude la
   *  modale e porta la trascrizione (e l'audio) sul messaggio citato. */
  onCitationClick?: (citation: EvaluationCitation) => void
  onCitationPlay?: (citation: EvaluationCitation) => void
  /** Riparte subito con un nuovo tentativo sullo stesso scenario: la
   *  prossima valutazione mostrerà i delta rispetto a questa. */
  onRetryScenario?: () => void
}

export default function EvaluationModal({
  avatarName,
  evaluation,
  isLoading,
  error,
  onRetry,
  onClose,
  currentTitle = null,
  onSubmitTitle,
  isSavingTitle = false,
  titleError = null,
  onCitationClick,
  onCitationPlay,
  onRetryScenario,
}: EvaluationModalProps) {
  const [title, setTitle] = useState(currentTitle ?? '')
  const isTouched = useRef(false)

  // The conversation created by the call can still be loading when the modal
  // opens: its automatic name fills the field as soon as it lands, unless the
  // user has already started typing their own.
  useEffect(() => {
    if (!isTouched.current) setTitle(currentTitle ?? '')
  }, [currentTitle])

  // The modal stays shut while the evaluation is being generated, so the call
  // cannot be dismissed before its feedback appears. Once the report (or an
  // error, which would otherwise trap the user) is on screen, every way out
  // opens up again.
  const isLocked = isLoading

  const trimmed = title.trim()
  // Only a blank name blocks the button: keeping the automatic one is a valid
  // choice, it just has nothing to persist and closes the modal straight away.
  const canSaveTitle = trimmed.length > 0 && !isSavingTitle && !isLocked
  const saveTitle = () => {
    if (!canSaveTitle) return
    if (trimmed === currentTitle) onClose()
    else onSubmitTitle?.(trimmed)
  }

  return (
    <ModalShell
      onClose={onClose}
      locked={isLocked}
      hideClose={isLocked}
      size="lg"
      padding="md"
      closeLabel="Chiudi valutazione"
    >
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-violet-600/20 bg-violet-600/10">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#7c3aed"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </div>
        <h2 className="mb-1 font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl">
          Valutazione della chiamata
        </h2>
        <p className="text-[0.85rem] text-slate-500">
          Il formatore AI ha analizzato la tua conversazione con {avatarName}.
        </p>
      </div>

      {isLoading ? (
        <LoadingState variant="modal" message="Valutazione della conversazione in corso..." />
      ) : error ? (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="flex w-full items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-[0.82rem] text-red-300">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-px shrink-0 text-red-500"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
          <button
            className="cursor-pointer rounded-xl border-none bg-gradient-to-br from-violet-600 to-cyan-500 px-6 py-2 text-sm font-semibold text-white transition hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(124,58,237,0.35)]"
            onClick={onRetry}
          >
            Riprova
          </button>
        </div>
      ) : !evaluation ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Nessuna valutazione disponibile per questa conversazione.
        </p>
      ) : (
        <>
          <EvaluationReport
            evaluation={evaluation}
            onCitationClick={onCitationClick}
            onCitationPlay={onCitationPlay}
          />
          <div className="mt-6 flex flex-col items-center gap-1.5">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <PdfDownloadButton
                fetchPdf={() => fetchEvaluationPdf(evaluation.conversation_id)}
                fileNameParts={['valutazione', avatarName]}
              />
              {onRetryScenario && (
                <button
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-violet-600/40 bg-violet-600/12 px-5 py-2 text-sm font-semibold text-violet-300 transition hover:-translate-y-px hover:bg-violet-600/25 hover:text-violet-200"
                  onClick={onRetryScenario}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                  Riprova questo scenario
                </button>
              )}
            </div>
            {onRetryScenario && (
              <p className="text-center text-[0.72rem] text-slate-500">
                Nuovo tentativo con {avatarName}, la prossima valutazione mostrerà i progressi
                rispetto a questa.
              </p>
            )}
          </div>
        </>
      )}

      {currentTitle !== null && (
        <div className="mt-8 border-t border-white/6 pt-6">
          <label
            htmlFor="conversation-title"
            className="mb-1 block font-heading text-[0.95rem] font-bold text-slate-100"
          >
            Dai un nome a questa conversazione
          </label>
          <p className="mb-3 text-[0.8rem] leading-normal text-slate-500">
            La chiamata è conclusa e non può essere ripresa. Le abbiamo dato un nome automatico,
            cambialo se preferisci ritrovarla con un altro.
          </p>
          <div className="flex gap-2 max-[480px]:flex-col">
            <input
              id="conversation-title"
              className="min-w-0 flex-1 rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-600 focus:bg-violet-600/8"
              value={title}
              maxLength={120}
              autoFocus
              placeholder="Es. Reclamo carta bloccata"
              disabled={isSavingTitle || isLocked}
              onChange={(e) => {
                isTouched.current = true
                setTitle(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  saveTitle()
                }
              }}
            />
            <button
              className="flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-gradient-to-br from-violet-600 to-cyan-500 px-6 py-2 text-sm font-semibold text-white transition hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(124,58,237,0.35)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
              onClick={saveTitle}
              disabled={!canSaveTitle}
            >
              {isSavingTitle && <Spinner variant="button" />}
              Salva e chiudi
            </button>
          </div>
          {titleError && <p className="mt-2 text-[0.8rem] text-red-400">{titleError}</p>}
        </div>
      )}
    </ModalShell>
  )
}
