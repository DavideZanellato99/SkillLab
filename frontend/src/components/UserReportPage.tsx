import { Fragment, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchUsersReport, deleteAdminConversation } from '../services/admin';
import type { UserActivityReport, ConversationReport } from '../services/admin';
import { isAdmin, ROLE_LABELS, ROLE_BADGE_CLASSES, getInitials } from '../services/auth';
import { categoryBadgeClasses } from './categoryStyles';
import ConversationModeBadge from './ConversationModeBadge';
import DataTable, { Td, Tr } from './DataTable';
import { matchesSearch } from './tableSearch';
import type { DataTableColumn } from './DataTable';

const overlayCls =
  'fixed inset-0 z-[200] flex animate-fade-in items-center justify-center bg-black/60 p-4 backdrop-blur-lg [animation-duration:0.2s]';
const modalCls =
  'relative max-h-[90vh] w-full max-w-[420px] animate-modal-in overflow-y-auto rounded-3xl border border-white/6 bg-gray-900/95 p-12 shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_60px_rgba(124,58,237,0.08)] backdrop-blur-2xl max-[480px]:rounded-2xl max-[480px]:p-8';
const modalCloseCls =
  'absolute right-4 top-4 cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 transition hover:bg-white/8 hover:text-slate-100';
const formErrorCls =
  'mb-4 flex animate-fade-in-up items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-[0.82rem] text-red-300 [animation-duration:0.2s]';
const spinnerCls = 'h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white';

interface DeletingConversation {
  userId: string;
  conversation: ConversationReport;
}

const REPORT_COLUMNS: DataTableColumn[] = [
  { key: 'utente', label: 'Utente' },
  { key: 'email', label: 'Email' },
  { key: 'ruolo', label: 'Ruolo' },
  { key: 'conversazioni', label: 'Conversazioni', align: 'center' },
  { key: 'durata', label: 'Durata Totale', align: 'right' },
  { key: 'dettaglio', ariaLabel: 'Dettaglio' },
];

/** "1 h 05 min", "12 min 34 s", "45 s" — "—" for zero/unknown durations */
function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '—';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min ${String(s).padStart(2, '0')} s`;
  return `${s} s`;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function UserReportPage() {
  const { user } = useAuth();
  const [report, setReport] = useState<UserActivityReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deletingConversation, setDeletingConversation] = useState<DeletingConversation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const visibleReport = report.filter((u) =>
    matchesSearch(search, `${u.nome} ${u.cognome}`, u.email, ROLE_LABELS[u.ruolo] ?? u.ruolo),
  );

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await fetchUsersReport();
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile caricare il report.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin(user)) {
      loadReport();
    }
  }, [user, loadReport]);

  const handleConfirmDeleteConversation = async () => {
    if (!deletingConversation) return;
    setDeleteError('');
    setIsDeleting(true);

    try {
      await deleteAdminConversation(deletingConversation.conversation.id);
      setReport((prev) =>
        prev.map((u) => {
          if (u.id !== deletingConversation.userId) return u;
          return {
            ...u,
            conversation_count: u.conversation_count - 1,
            total_duration_seconds: u.total_duration_seconds - deletingConversation.conversation.duration_seconds,
            conversations: u.conversations.filter((c) => c.id !== deletingConversation.conversation.id),
          };
        }),
      );
      setDeletingConversation(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Errore durante l'eliminazione della conversazione.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isAdmin(user)) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-6 py-12">
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-white/6 bg-gray-900/60 p-16 text-center text-red-300">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <h2 className="font-heading text-2xl text-slate-100">Accesso Negato</h2>
          <p className="max-w-[400px] text-slate-400">
            Solo gli utenti con ruolo <strong>Super Admin</strong> o <strong>Organization Admin</strong> possono
            visualizzare il report delle attività.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-12">
      <header className="mb-12">
        <h1 className="mb-1 font-heading text-3xl font-bold text-slate-100">Report Attività</h1>
        <p className="text-[0.95rem] text-slate-500">
          Recap in sola lettura degli utenti, delle loro conversazioni con gli avatar e delle durate.
        </p>
      </header>

      {error && (
        <div className="mb-8 flex animate-fade-in-up items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-300 [animation-duration:0.2s]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-4 p-16 text-slate-500">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-violet-600/15 border-t-violet-600" />
          <p>Caricamento report attività...</p>
        </div>
      ) : (
        <DataTable
          columns={REPORT_COLUMNS}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Cerca per nome, email o ruolo..."
          isEmpty={visibleReport.length === 0}
          emptyMessage={search ? 'Nessun utente corrisponde alla ricerca.' : 'Nessun utente trovato.'}
        >
          {visibleReport.map((u) => {
            const isExpanded = expandedUserId === u.id;
            return (
              <Fragment key={u.id}>
                <Tr
                  hover={!isExpanded}
                  className={`cursor-pointer ${isExpanded ? '[&>td]:bg-violet-600/6' : ''}`}
                  onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                >
                  <Td>
                    <div className="flex items-center gap-4">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 text-xs font-bold text-white">
                        {getInitials(u.nome, u.cognome, u.email)}
                      </div>
                      <span className="font-semibold text-slate-100">
                        {u.nome && u.cognome ? `${u.nome} ${u.cognome}` : '—'}
                      </span>
                    </div>
                  </Td>
                  <Td><span className="text-slate-400">{u.email}</span></Td>
                  <Td>
                    <span className={`w-fit rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider ${ROLE_BADGE_CLASSES[u.ruolo] ?? ''}`}>
                      {ROLE_LABELS[u.ruolo] ?? u.ruolo}
                    </span>
                  </Td>
                  <Td align="center">
                    <span className="inline-block min-w-8 rounded-full border border-white/6 bg-white/4 px-2 py-0.5 text-[0.8rem] font-semibold text-slate-100">
                      {u.conversation_count}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="font-semibold text-cyan-400">{formatDuration(u.total_duration_seconds)}</span>
                  </Td>
                  <Td align="right">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`inline-block text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </Td>
                </Tr>

                {isExpanded && (
                  <tr>
                    <Td colSpan={6} className="bg-gray-950/40">
                      {u.conversations.length === 0 ? (
                        <p className="py-4 text-center text-[0.85rem] italic text-slate-500">
                          Nessuna conversazione registrata per questo utente.
                        </p>
                      ) : (
                        <ul className="flex list-none flex-col gap-2">
                          {u.conversations.map((conv) => (
                            <li
                              key={conv.id}
                              className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-white/6 bg-white/3 px-4 py-2"
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <ConversationModeBadge mode={conv.mode} />
                                <span className="truncate text-[0.85rem] font-semibold text-slate-100">{conv.title}</span>
                                <span className="shrink-0 text-slate-700">·</span>
                                <span className="truncate text-[0.85rem] text-slate-400">{conv.avatar_name}</span>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-widest ${categoryBadgeClasses(conv.avatar_category)}`}>
                                  {conv.avatar_category}
                                </span>
                              </div>
                              <span className="text-xs text-slate-500">{formatDateTime(conv.created_at)}</span>
                              <span className="text-xs text-slate-400">{conv.message_count} msg</span>
                              <span className="min-w-[90px] text-right text-[0.85rem] font-semibold text-cyan-400">
                                {formatDuration(conv.duration_seconds)}
                              </span>
                              <button
                                type="button"
                                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/6 bg-white/4 text-slate-400 transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                                aria-label="Elimina conversazione"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteError('');
                                  setDeletingConversation({ userId: u.id, conversation: conv });
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </DataTable>
      )}

      {/* Modal Conferma Eliminazione Conversazione */}
      {deletingConversation && (
        <div className={overlayCls} onClick={() => !isDeleting && setDeletingConversation(null)}>
          <div className={modalCls} onClick={(e) => e.stopPropagation()}>
            <button className={modalCloseCls} onClick={() => setDeletingConversation(null)} disabled={isDeleting}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/10">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </div>
              <h2 className="mb-1 font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl">Elimina Conversazione</h2>
              <p className="text-[0.85rem] text-slate-500">
                Stai per eliminare la conversazione con{' '}
                <strong className="text-slate-100">{deletingConversation.conversation.avatar_name}</strong> del{' '}
                {formatDateTime(deletingConversation.conversation.created_at)}, incluse tutte le sue trascrizioni e
                valutazioni. L'operazione non è reversibile.
              </p>
            </div>

            {deleteError && <div className={formErrorCls}>{deleteError}</div>}

            <div className="flex gap-3">
              <button
                className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setDeletingConversation(null)}
                disabled={isDeleting}
              >
                Annulla
              </button>
              <button
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleConfirmDeleteConversation}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <span className={spinnerCls} />
                    Eliminazione...
                  </>
                ) : (
                  'Elimina Definitivamente'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
