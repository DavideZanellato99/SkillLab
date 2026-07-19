import type { ConversationEvaluation } from '../services/api';

/* Corpo della valutazione AI: punteggio complessivo, punteggi per criterio e
 * spunti di miglioramento. Usato sia dalla EvaluationModal post-chiamata sia
 * dal dettaglio conversazione della dashboard admin. */

function scoreTextColor(score: number): string {
  if (score >= 7) return 'text-emerald-400';
  if (score >= 5) return 'text-orange-400';
  return 'text-red-400';
}

function scoreBarColor(score: number): string {
  if (score >= 7) return 'bg-emerald-500';
  if (score >= 5) return 'bg-orange-500';
  return 'bg-red-500';
}

function formatScore(score: number): string {
  return score.toLocaleString('it-IT', { maximumFractionDigits: 1 });
}

export default function EvaluationReport({ evaluation }: { evaluation: ConversationEvaluation }) {
  return (
    <>
      {/* Overall score */}
      <div className="mb-6 flex flex-col items-center gap-1 rounded-2xl border border-white/6 bg-white/4 py-6">
        <span className="text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500">
          Punteggio complessivo
        </span>
        <div className="flex items-baseline gap-1">
          <span className={`font-heading text-5xl font-bold ${scoreTextColor(evaluation.overall_score)}`}>
            {formatScore(evaluation.overall_score)}
          </span>
          <span className="text-lg text-slate-500">/ 10</span>
        </div>
        {evaluation.summary && (
          <p className="mt-2 max-w-[480px] px-6 text-center text-[0.85rem] leading-relaxed text-slate-400">
            {evaluation.summary}
          </p>
        )}
      </div>

      {/* Per-criterion scores */}
      <div className="flex flex-col gap-4">
        {evaluation.criteria.map((criterion) => (
          <div key={criterion.key} className="rounded-2xl border border-white/6 bg-slate-800/40 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-100">{criterion.label}</span>
              <span className={`shrink-0 text-sm font-bold ${scoreTextColor(criterion.score)}`}>
                {formatScore(criterion.score)} / 10
              </span>
            </div>
            <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-white/6">
              <div
                className={`h-full rounded-full transition-all ${scoreBarColor(criterion.score)}`}
                style={{ width: `${Math.max(0, Math.min(100, criterion.score * 10))}%` }}
              />
            </div>
            {criterion.comment && (
              <p className="text-[0.82rem] leading-relaxed text-slate-400">{criterion.comment}</p>
            )}
            {criterion.suggestions && (
              <div className="mt-3 rounded-xl border border-cyan-500/25 bg-cyan-500/8 px-4 py-3">
                <span className="mb-1 flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-cyan-400">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18h6" />
                    <path d="M10 22h4" />
                    <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z" />
                  </svg>
                  Spunti di miglioramento
                </span>
                <p className="text-[0.82rem] leading-relaxed text-slate-300">{criterion.suggestions}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-[0.7rem] text-slate-500">
        Valutazione generata il {' '}
        {new Date(evaluation.updated_at).toLocaleString('it-IT', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </p>
    </>
  );
}
