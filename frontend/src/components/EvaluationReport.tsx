import type { ConversationEvaluation, EvaluationCitation } from '../services/api';

/* Corpo della valutazione AI: punteggio complessivo, punteggi per criterio e
 * spunti di miglioramento. Usato sia dalla EvaluationModal post-chiamata sia
 * dal dettaglio conversazione della dashboard admin.
 *
 * Ogni criterio può citare i messaggi su cui il giudizio si fonda: le chip
 * compaiono solo se chi ospita il report passa onCitationClick, perché senza
 * una trascrizione da raggiungere il numero da solo non dice nulla. */

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

/* Variazione rispetto al tentativo precedente sullo stesso scenario: verde
 * se in miglioramento, rossa se in peggioramento, neutra se invariata. */
function DeltaBadge({ delta }: { delta: number }) {
  const rounded = Math.round(delta * 10) / 10;
  const cls =
    rounded > 0
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
      : rounded < 0
        ? 'border-red-500/30 bg-red-500/10 text-red-400'
        : 'border-white/10 bg-white/5 text-slate-500';
  const label =
    rounded > 0
      ? `▲ +${formatScore(rounded)}`
      : rounded < 0
        ? `▼ −${formatScore(Math.abs(rounded))}`
        : '=';
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-[0.68rem] font-semibold ${cls}`}
      title="Variazione rispetto al tentativo precedente"
    >
      {label}
    </span>
  );
}

interface EvaluationReportProps {
  evaluation: ConversationEvaluation;
  /** Porta la trascrizione sul messaggio citato; abilita le chip. */
  onCitationClick?: (citation: EvaluationCitation) => void;
  /** Fa ripartire la registrazione dal momento citato; aggiunge il tasto
   *  di ascolto alle chip (solo chiamate con registrazione). */
  onCitationPlay?: (citation: EvaluationCitation) => void;
}

export default function EvaluationReport({
  evaluation,
  onCitationClick,
  onCitationPlay,
}: EvaluationReportProps) {
  const previous = evaluation.previous ?? null;

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
        {previous && (
          <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5 px-6 text-xs text-slate-500">
            <DeltaBadge delta={evaluation.overall_score - previous.overall_score} />
            <span>
              rispetto a «{previous.title}» del{' '}
              {new Date(previous.conversation_at).toLocaleDateString('it-IT', {
                day: '2-digit',
                month: 'short',
              })}{' '}
              ({formatScore(previous.overall_score)} / 10)
            </span>
          </div>
        )}
        {evaluation.summary && (
          <p className="mt-2 max-w-[480px] px-6 text-center text-[0.85rem] leading-relaxed text-slate-400">
            {evaluation.summary}
          </p>
        )}
      </div>

      {/* Per-criterion scores */}
      <div className="flex flex-col gap-4">
        {evaluation.criteria.map((criterion) => {
          const previousScore = previous?.criteria_scores[criterion.key];
          return (
          <div key={criterion.key} className="rounded-2xl border border-white/6 bg-slate-800/40 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-100">{criterion.label}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                {previousScore !== undefined && (
                  <DeltaBadge delta={criterion.score - previousScore} />
                )}
                <span className={`text-sm font-bold ${scoreTextColor(criterion.score)}`}>
                  {formatScore(criterion.score)} / 10
                </span>
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
            {onCitationClick && criterion.citations && criterion.citations.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">
                  Momenti citati
                </span>
                {criterion.citations.map((citation) => (
                  <span
                    key={citation.index}
                    className="inline-flex items-center overflow-hidden rounded-full border border-violet-500/30 bg-violet-500/10 text-[0.72rem] font-medium text-violet-300"
                  >
                    <button
                      className="cursor-pointer border-none bg-transparent px-2.5 py-0.5 text-inherit transition hover:bg-violet-500/20"
                      onClick={() => onCitationClick(citation)}
                      title="Vai al messaggio nella trascrizione"
                    >
                      Messaggio {citation.index}
                    </button>
                    {onCitationPlay && (
                      <button
                        className="cursor-pointer border-y-0 border-l border-r-0 border-solid border-violet-500/30 bg-transparent py-0.5 pl-1.5 pr-2 text-inherit transition hover:bg-violet-500/20"
                        onClick={() => onCitationPlay(citation)}
                        aria-label={`Ascolta il messaggio ${citation.index} nella registrazione`}
                        title="Ascolta questo momento nella registrazione"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </button>
                    )}
                  </span>
                ))}
              </div>
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
          );
        })}
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
