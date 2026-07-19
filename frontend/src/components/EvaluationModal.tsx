import type { ConversationEvaluation } from '../services/api';
import EvaluationReport from './EvaluationReport';

/* Post-call evaluation modal: overall score, per-criterion scores and
 * improvement suggestions (present only where the score is below 7). */

interface EvaluationModalProps {
  avatarName: string;
  evaluation: ConversationEvaluation | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}

const overlayCls =
  'fixed inset-0 z-[200] flex animate-fade-in items-center justify-center bg-black/60 p-4 backdrop-blur-lg [animation-duration:0.2s]';
const modalCloseCls =
  'absolute right-4 top-4 cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 transition hover:bg-white/8 hover:text-slate-100';

export default function EvaluationModal({
  avatarName,
  evaluation,
  isLoading,
  error,
  onRetry,
  onClose,
}: EvaluationModalProps) {
  return (
    <div className={overlayCls} onClick={onClose}>
      <div
        className="relative max-h-[92vh] w-full max-w-[640px] animate-modal-in overflow-y-auto rounded-3xl border border-white/6 bg-gray-900/95 p-10 shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_60px_rgba(124,58,237,0.08)] backdrop-blur-2xl max-[480px]:rounded-2xl max-[480px]:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button className={modalCloseCls} onClick={onClose} aria-label="Chiudi valutazione">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-violet-600/20 bg-violet-600/10">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          <div className="flex flex-col items-center justify-center gap-4 py-12 text-slate-500">
            <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-violet-600/15 border-t-violet-600" />
            <p className="text-sm">Valutazione della conversazione in corso...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex w-full items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-[0.82rem] text-red-300">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0 text-red-500">
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
          <EvaluationReport evaluation={evaluation} />
        )}
      </div>
    </div>
  );
}
