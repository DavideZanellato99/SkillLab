import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isAdmin, isSuperAdmin } from '../services/auth';
import type { AuthUser } from '../services/auth';
import { fetchAllUsers, fetchAdminAvatars } from '../services/admin';
import type { AdminAvatar } from '../services/admin';
import { fetchOrganizations } from '../services/organizations';
import type { Organization } from '../services/organizations';
import {
  fetchAssignments,
  createAssignments,
  deleteAssignment,
} from '../services/training';
import type { TrainingAssignment, AssignmentStatus } from '../services/training';
import DataTable, { Td, Tr } from './DataTable';
import SearchSelect from './SearchSelect';
import Select from './Select';
import Tooltip from './Tooltip';
import { matchesSearch } from './tableSearch';

/* Percorsi di training assegnati: il super admin affida a uno o più utenti
 * un obiettivo su un avatar (punteggio target, scadenza opzionale) e da qui
 * tutti gli admin ne seguono lo stato di completamento, derivato dalle
 * valutazioni. L'organization admin vede solo la propria organizzazione e
 * non crea né elimina. */

const cardCls = 'rounded-2xl border border-white/6 bg-gray-900/60 p-6 backdrop-blur-md';
const inputCls =
  'rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-600 focus:bg-violet-600/8';

export const STATUS_META: Record<AssignmentStatus, { label: string; cls: string }> = {
  active: { label: 'In corso', cls: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400' },
  overdue: { label: 'Scaduto', cls: 'border-red-500/30 bg-red-500/10 text-red-400' },
  completed: {
    label: 'Completato',
    cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  },
  completed_late: {
    label: 'Completato in ritardo',
    cls: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  },
};

export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.72rem] font-semibold ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

function formatScore(score: number): string {
  return score.toLocaleString('it-IT', { maximumFractionDigits: 1 });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function TrainingPage() {
  const { user } = useAuth();
  const canManage = isSuperAdmin(user);

  const [assignments, setAssignments] = useState<TrainingAssignment[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgFilter, setOrgFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // ── Form di assegnazione (solo super admin) ────────
  const [avatars, setAvatars] = useState<AdminAvatar[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [avatarId, setAvatarId] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [targetScore, setTargetScore] = useState('7');
  const [dueDate, setDueDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  useEffect(() => {
    if (!isAdmin(user)) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError('');
      try {
        const data = await fetchAssignments(orgFilter || undefined);
        if (!cancelled) setAssignments(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Impossibile caricare i percorsi.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, orgFilter, reloadKey]);

  useEffect(() => {
    if (!canManage) return;
    fetchAdminAvatars().then(setAvatars).catch(() => setAvatars([]));
    fetchAllUsers().then(setUsers).catch(() => setUsers([]));
    fetchOrganizations().then(setOrganizations).catch(() => setOrganizations([]));
  }, [canManage]);

  const selectedAvatar = avatars.find((a) => a.id === avatarId) ?? null;

  // Solo gli utenti attivi dell'organizzazione dell'avatar possono
  // riceverlo come obiettivo: l'avatar è privato del suo tenant
  const assignableUsers = useMemo(() => {
    if (!selectedAvatar) return [];
    return users
      .filter(
        (u) =>
          u.organization_id === selectedAvatar.organization_id &&
          u.ruolo !== 'super_admin' &&
          u.status === 'active',
      )
      .sort((a, b) => `${a.nome} ${a.cognome}`.localeCompare(`${b.nome} ${b.cognome}`, 'it'));
  }, [users, selectedAvatar]);

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const parsedTarget = Number(targetScore.replace(',', '.'));
  const canSubmit =
    !isSaving &&
    avatarId !== '' &&
    selectedUserIds.size > 0 &&
    Number.isFinite(parsedTarget) &&
    parsedTarget >= 1 &&
    parsedTarget <= 10;

  const handleCreate = async () => {
    if (!canSubmit) return;
    setIsSaving(true);
    setFormError('');
    setFormSuccess('');
    try {
      const created = await createAssignments({
        avatar_id: avatarId,
        user_ids: Array.from(selectedUserIds),
        target_score: parsedTarget,
        // Fine giornata: una scadenza vale per tutto il giorno indicato
        due_at: dueDate ? `${dueDate}T23:59:59` : null,
      });
      setFormSuccess(
        created.length === 1
          ? 'Percorso assegnato a 1 utente.'
          : `Percorso assegnato a ${created.length} utenti.`,
      );
      setSelectedUserIds(new Set());
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Assegnazione non riuscita.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (assignment: TrainingAssignment) => {
    try {
      await deleteAssignment(assignment.id);
      setAssignments((prev) => prev.filter((a) => a.id !== assignment.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eliminazione non riuscita.');
    }
  };

  const searchedRows = useMemo(
    () =>
      assignments.filter((a) =>
        matchesSearch(
          search,
          a.user_name,
          a.user_email,
          a.avatar_name,
          a.organization_name ?? '',
          STATUS_META[a.status].label,
        ),
      ),
    [assignments, search],
  );

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
            Solo gli utenti con ruolo <strong>Super Admin</strong> o{' '}
            <strong>Organization Admin</strong> possono visualizzare i percorsi di training.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-12">
      <header className="mb-8 flex items-start justify-between gap-4 max-sm:flex-col">
        <div>
          <h1 className="mb-1 font-heading text-3xl font-bold text-slate-100">
            Percorsi di training
          </h1>
          <p className="text-[0.95rem] text-slate-500">
            Obiettivi assegnati agli utenti, con lo stato di completamento derivato dalle
            valutazioni.
          </p>
        </div>
        {isSuperAdmin(user) && (
          <Select
            id="training-org-filter"
            className="min-w-[220px] shrink-0 max-sm:w-full"
            value={orgFilter}
            onChange={setOrgFilter}
            options={[
              { value: '', label: 'Tutte le organizzazioni' },
              ...organizations.map((o) => ({ value: o.id, label: o.name })),
            ]}
          />
        )}
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

      {canManage && (
        <div className={`${cardCls} mb-8`}>
          <h2 className="mb-1 text-sm font-semibold text-slate-300">Assegna un nuovo percorso</h2>
          <p className="mb-4 text-xs text-slate-500">
            Scegli lo scenario, gli utenti dell'organizzazione e l'obiettivo da raggiungere.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[240px] flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="training-avatar">
                Avatar / scenario
              </label>
              <SearchSelect
                id="training-avatar"
                value={avatarId}
                onChange={(value) => {
                  setAvatarId(value);
                  setSelectedUserIds(new Set());
                  setFormSuccess('');
                }}
                options={avatars.map((a) => ({
                  value: a.id,
                  label: a.name,
                  sub: `${a.organization_name} · ${a.category}`,
                }))}
                placeholder="Cerca un avatar..."
              />
            </div>
            <div className="w-[130px]">
              <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="training-target">
                Obiettivo (1-10)
              </label>
              <input
                id="training-target"
                className={`${inputCls} w-full`}
                type="number"
                min={1}
                max={10}
                step={0.5}
                value={targetScore}
                onChange={(e) => setTargetScore(e.target.value)}
              />
            </div>
            <div className="w-[170px]">
              <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="training-due">
                Scadenza (opzionale)
              </label>
              <input
                id="training-due"
                className={`${inputCls} w-full [color-scheme:dark]`}
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <button
              className="flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border-none bg-gradient-to-br from-violet-600 to-cyan-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(124,58,237,0.35)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
              onClick={handleCreate}
              disabled={!canSubmit}
            >
              {isSaving && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              )}
              Assegna
            </button>
          </div>

          {selectedAvatar && (
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">
                  Utenti di {selectedAvatar.organization_name}
                </span>
                {assignableUsers.length > 0 && (
                  <button
                    className="cursor-pointer border-none bg-transparent text-xs font-medium text-violet-400 transition hover:text-violet-300"
                    onClick={() =>
                      setSelectedUserIds((prev) =>
                        prev.size === assignableUsers.length
                          ? new Set()
                          : new Set(assignableUsers.map((u) => u.id)),
                      )
                    }
                  >
                    {selectedUserIds.size === assignableUsers.length
                      ? 'Deseleziona tutti'
                      : 'Seleziona tutti'}
                  </button>
                )}
              </div>
              {assignableUsers.length === 0 ? (
                <p className="py-3 text-sm italic text-slate-500">
                  Nessun utente attivo in questa organizzazione.
                </p>
              ) : (
                <div className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto rounded-xl border border-white/6 bg-gray-950/40 p-2 max-md:grid-cols-1">
                  {assignableUsers.map((u) => (
                    <label
                      key={u.id}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 transition ${
                        selectedUserIds.has(u.id)
                          ? 'bg-violet-600/15 text-slate-100'
                          : 'text-slate-400 hover:bg-white/4'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-violet-600"
                        checked={selectedUserIds.has(u.id)}
                        onChange={() => toggleUser(u.id)}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[0.85rem] font-medium">
                          {u.nome && u.cognome ? `${u.nome} ${u.cognome}` : u.email}
                        </span>
                        <span className="block truncate text-[0.72rem] text-slate-500">
                          {u.email}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {formError && <p className="mt-3 text-[0.82rem] text-red-400">{formError}</p>}
          {formSuccess && <p className="mt-3 text-[0.82rem] text-emerald-400">{formSuccess}</p>}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-4 p-16 text-slate-500">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-violet-600/15 border-t-violet-600" />
          <p>Caricamento percorsi...</p>
        </div>
      ) : (
        <DataTable
          columns={[
            { key: 'utente', label: 'Utente' },
            { key: 'avatar', label: 'Avatar' },
            { key: 'obiettivo', label: 'Obiettivo', align: 'center' },
            { key: 'scadenza', label: 'Scadenza' },
            { key: 'tentativi', label: 'Tentativi', align: 'center' },
            { key: 'migliore', label: 'Migliore', align: 'center' },
            { key: 'stato', label: 'Stato' },
            ...(canManage ? [{ key: 'azioni', label: '', align: 'right' as const }] : []),
          ]}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Cerca per utente, avatar o stato..."
          isEmpty={searchedRows.length === 0}
          emptyMessage={
            search
              ? 'Nessun percorso corrisponde alla ricerca.'
              : 'Nessun percorso assegnato per la selezione corrente.'
          }
        >
          {searchedRows.map((a) => (
            <Tr key={a.id}>
              <Td>
                <span className="block text-[0.85rem] font-medium text-slate-100">
                  {a.user_name}
                </span>
                <span className="block text-[0.72rem] text-slate-500">{a.user_email}</span>
              </Td>
              <Td>
                <span className="block text-[0.85rem] text-slate-100">{a.avatar_name}</span>
                <span className="block text-[0.72rem] text-slate-500">{a.avatar_category}</span>
              </Td>
              <Td align="center">
                <span className="text-sm font-bold tabular-nums text-slate-100">
                  {formatScore(a.target_score)}
                </span>
              </Td>
              <Td className="text-[0.82rem] text-slate-400">
                {a.due_at ? formatDate(a.due_at) : '—'}
              </Td>
              <Td align="center" className="text-[0.85rem] tabular-nums text-slate-300">
                {a.attempts}
              </Td>
              <Td align="center">
                {a.best_score !== null ? (
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      a.best_score >= a.target_score ? 'text-emerald-400' : 'text-orange-400'
                    }`}
                  >
                    {formatScore(a.best_score)}
                  </span>
                ) : (
                  <span className="text-slate-600">—</span>
                )}
              </Td>
              <Td>
                <AssignmentStatusBadge status={a.status} />
              </Td>
              {canManage && (
                <Td align="right">
                  <Tooltip content="Elimina il percorso">
                    <button
                      className="cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
                      onClick={() => handleDelete(a)}
                      aria-label={`Elimina il percorso di ${a.user_name} su ${a.avatar_name}`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </Tooltip>
                </Td>
              )}
            </Tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
