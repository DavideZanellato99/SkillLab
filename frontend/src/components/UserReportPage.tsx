import { Fragment, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchUsersReport } from '../services/admin';
import type { UserActivityReport } from '../services/admin';
import { isAdmin, ROLE_LABELS, ROLE_BADGE_CLASSES } from '../services/auth';
import { categoryBadgeClasses } from './categoryStyles';
import DataTable, { Td, Tr } from './DataTable';
import { matchesSearch } from './tableSearch';
import type { DataTableColumn } from './DataTable';

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
                        {(u.nome || u.email)[0].toUpperCase()}
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
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-violet-400">
                                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                </svg>
                                <span className="truncate text-[0.85rem] font-semibold text-slate-100">{conv.avatar_name}</span>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-widest ${categoryBadgeClasses(conv.avatar_category)}`}>
                                  {conv.avatar_category}
                                </span>
                              </div>
                              <span className="text-xs text-slate-500">{formatDateTime(conv.created_at)}</span>
                              <span className="text-xs text-slate-400">{conv.message_count} msg</span>
                              <span className="min-w-[90px] text-right text-[0.85rem] font-semibold text-cyan-400">
                                {formatDuration(conv.duration_seconds)}
                              </span>
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
    </div>
  );
}
