import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchMyAssignments } from '../services/training';
import type { TrainingAssignment } from '../services/training';
import { AssignmentStatusBadge } from './TrainingPage';
import { categoryBadgeClasses } from './categoryStyles';

/* Striscia "I tuoi percorsi" in cima alla home: gli obiettivi assegnati
 * all'utente, con il progresso verso il punteggio target. Ogni card apre
 * la chat dell'avatar dello scenario. Se non c'è nessun percorso la
 * sezione non esiste. */

function formatScore(score: number): string {
  return score.toLocaleString('it-IT', { maximumFractionDigits: 1 });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

export default function TrainingGoals() {
  const [assignments, setAssignments] = useState<TrainingAssignment[]>([]);

  useEffect(() => {
    fetchMyAssignments()
      .then(setAssignments)
      .catch(() => setAssignments([]));
  }, []);

  if (assignments.length === 0) return null;

  // Prima quelli ancora da chiudere, i completati in coda e attenuati
  const sorted = [...assignments].sort((a, b) => {
    const openA = a.status === 'active' || a.status === 'overdue' ? 0 : 1;
    const openB = b.status === 'active' || b.status === 'overdue' ? 0 : 1;
    return openA - openB;
  });

  return (
    <section className="mb-8" aria-label="I tuoi percorsi di training">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="font-heading text-lg font-bold text-slate-100">I tuoi percorsi</h2>
        <span className="text-xs text-slate-500">
          Obiettivi assegnati dal tuo formatore
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {sorted.map((a) => {
          const isOpen = a.status === 'active' || a.status === 'overdue';
          const progress = Math.max(
            0,
            Math.min(1, (a.best_score ?? 0) / a.target_score),
          );
          return (
            <Link
              key={a.id}
              to={`/chat/${a.avatar_id}`}
              className={`group flex flex-col gap-2 rounded-2xl border border-white/6 bg-gray-900/60 p-4 no-underline backdrop-blur-md transition hover:-translate-y-px hover:border-violet-600/50 hover:bg-violet-600/8 ${
                isOpen ? '' : 'opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="block truncate text-[0.95rem] font-semibold text-slate-100">
                    {a.avatar_name}
                  </span>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider ${categoryBadgeClasses(a.avatar_category)}`}
                  >
                    {a.avatar_category}
                  </span>
                </div>
                <AssignmentStatusBadge status={a.status} />
              </div>
              <div className="mt-auto">
                <div className="mb-1 flex items-baseline justify-between text-[0.78rem]">
                  <span className="text-slate-400">
                    Obiettivo{' '}
                    <strong className="font-bold text-slate-100">
                      {formatScore(a.target_score)}/10
                    </strong>
                    {a.due_at && <span className="text-slate-500"> entro il {formatDate(a.due_at)}</span>}
                  </span>
                  <span className="tabular-nums text-slate-400">
                    {a.best_score !== null ? (
                      <>
                        migliore{' '}
                        <strong
                          className={`font-bold ${
                            a.best_score >= a.target_score ? 'text-emerald-400' : 'text-orange-400'
                          }`}
                        >
                          {formatScore(a.best_score)}
                        </strong>
                      </>
                    ) : (
                      'nessun tentativo'
                    )}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/6">
                  <div
                    className={`h-full rounded-full transition-all ${
                      progress >= 1 ? 'bg-emerald-500' : 'bg-gradient-to-r from-violet-600 to-cyan-500'
                    }`}
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
