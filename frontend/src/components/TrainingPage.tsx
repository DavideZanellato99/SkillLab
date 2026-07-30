import { useState, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { isAdmin, isSuperAdmin } from '../services/auth'
import { useOrganizations } from '../hooks/useOrganizations'
import {
  useAssignments,
  useAssignableUsers,
  useCreateAssignments,
  useDeleteAssignment,
} from '../hooks/useTraining'
import { useAvatars } from '../hooks/useAvatars'
import { useAdminAvatars } from '../hooks/useAdminAvatars'
import type { TrainingAssignment, AssignmentStatus } from '../services/training'
import DataTable, { Td, Tr } from './DataTable'
import SearchSelect from './SearchSelect'
import Select from './Select'
import Spinner from './Spinner'
import LoadingState from './LoadingState'
import { PageContainer, PageHeader } from './PageLayout'
import Tooltip from './Tooltip'
import { TrashIcon } from './icons'
import { cardInputCls as inputCls } from './Field'
import { matchesSearch } from './tableSearch'

/* Percorsi di training assegnati: un admin affida a uno o più utenti un
 * obiettivo su un avatar (punteggio target, scadenza opzionale) e da qui ne
 * segue lo stato di completamento, derivato dalle valutazioni.
 *
 * Assegnano entrambi i ruoli admin, ma l'organization admin resta chiuso nel
 * proprio tenant: sceglie fra gli avatar della sua organizzazione, i suoi
 * utenti, i suoi percorsi. Il filtro per organizzazione ha senso solo per il
 * super admin, che è l'unico a vederne più di una. */

/** Un avatar assegnabile, ridotto a ciò che serve al selettore.
 *
 *  Le due sorgenti sono diverse perché diversi sono i permessi: il super
 *  admin legge il catalogo admin di tutti i tenant, l'organization admin la
 *  galleria che vede comunque, cioè quella della sua organizzazione. In
 *  entrambi i casi arrivano solo avatar non archiviati, gli unici su cui il
 *  server accetti di aprire un percorso. */
interface AssignableAvatar {
  id: string
  name: string
  category: string
  organization_id: string
  organization_name: string
}

const cardCls = 'rounded-2xl border border-white/6 bg-gray-900/60 p-6 backdrop-blur-md'

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
}

export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.72rem] font-semibold ${meta.cls}`}
    >
      {meta.label}
    </span>
  )
}

function formatScore(score: number): string {
  return score.toLocaleString('it-IT', { maximumFractionDigits: 1 })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default function TrainingPage() {
  const { user } = useAuth()
  const isSuper = isSuperAdmin(user)
  const canManage = isAdmin(user)

  const { data: organizations = [] } = useOrganizations(isSuper)
  const [orgFilter, setOrgFilter] = useState('')
  const [search, setSearch] = useState('')

  const {
    data: assignments = [],
    isPending: isLoading,
    error: loadError,
  } = useAssignments(orgFilter, isAdmin(user))

  // ── Form di assegnazione (super admin e organization admin) ────────
  const [avatarId, setAvatarId] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [targetScore, setTargetScore] = useState('7')
  const [dueDate, setDueDate] = useState('')
  const [formValidationError, setFormValidationError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  const createMutation = useCreateAssignments()
  const deleteMutation = useDeleteAssignment()

  const errorOf = (error: unknown, fallback: string) =>
    error ? (error instanceof Error ? error.message : fallback) : ''
  const isSaving = createMutation.isPending
  const formError =
    formValidationError || errorOf(createMutation.error, 'Assegnazione non riuscita.')

  /* Gli avatar assegnabili arrivano da due sorgenti diverse perché diversi
   * sono i permessi: il super admin legge il catalogo admin di tutti i
   * tenant, l'organization admin la galleria che vede comunque, cioè quella
   * della sua organizzazione. Solo una delle due query è attiva per volta. */
  const { data: adminAvatars = [] } = useAdminAvatars(false, canManage && isSuper)
  const { data: galleryAvatars = [] } = useAvatars(undefined, canManage && !isSuper)

  const avatars: AssignableAvatar[] = useMemo(
    () =>
      isSuper
        ? adminAvatars.map((a) => ({
            id: a.id,
            name: a.name,
            category: a.category,
            organization_id: a.organization_id,
            organization_name: a.organization_name,
          }))
        : galleryAvatars.map((a) => ({
            id: a.id,
            name: a.name,
            category: a.category,
            organization_id: user?.organization_id ?? '',
            organization_name: user?.organization_name ?? '',
          })),
    [isSuper, adminAvatars, galleryAvatars, user],
  )

  const selectedAvatar = avatars.find((a) => a.id === avatarId) ?? null
  const selectedAvatarOrgId = selectedAvatar?.organization_id ?? null

  /* Chi può ricevere l'avatar selezionato come obiettivo: gli utenti attivi
   * del tenant a cui l'avatar appartiene. Lo decide il server, che applica la
   * stessa regola con cui poi accetta o rifiuta l'assegnazione, quindi qui
   * non si filtra nulla. Per l'org admin il tenant che passiamo è comunque il
   * suo, ed è quello che il server userebbe ignorando il parametro. */
  const { data: assignableUsers = [] } = useAssignableUsers(selectedAvatarOrgId, canManage)

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const parsedTarget = Number(targetScore.replace(',', '.'))
  const canSubmit =
    !isSaving &&
    avatarId !== '' &&
    selectedUserIds.size > 0 &&
    Number.isFinite(parsedTarget) &&
    parsedTarget >= 1 &&
    parsedTarget <= 10

  const handleCreate = async () => {
    if (!canSubmit) return
    setFormValidationError('')
    setFormSuccess('')
    createMutation.reset()
    try {
      const created = await createMutation.mutateAsync({
        avatar_id: avatarId,
        user_ids: Array.from(selectedUserIds),
        target_score: parsedTarget,
        // Fine giornata: una scadenza vale per tutto il giorno indicato
        due_at: dueDate ? `${dueDate}T23:59:59` : null,
      })
      setFormSuccess(
        created.length === 1
          ? 'Percorso assegnato a 1 utente.'
          : `Percorso assegnato a ${created.length} utenti.`,
      )
      setSelectedUserIds(new Set())
    } catch {
      // Il messaggio è nella mutation, il banner del form lo mostra
    }
  }

  const handleDelete = (assignment: TrainingAssignment) => deleteMutation.mutate(assignment.id)

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
  )

  return (
    <PageContainer>
      <PageHeader
        title="Percorsi di training"
        description="Obiettivi assegnati agli utenti, con lo stato di completamento derivato dalle valutazioni."
        actions={
          isSuperAdmin(user) && (
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
          )
        }
      />

      {(loadError || deleteMutation.error) && (
        <div className="mb-8 flex animate-fade-in-up items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-300 [animation-duration:0.2s]">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>
            {errorOf(loadError, 'Impossibile caricare i percorsi.') ||
              errorOf(deleteMutation.error, 'Eliminazione non riuscita.')}
          </span>
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
              <label
                className="mb-1 block text-xs font-medium text-slate-400"
                htmlFor="training-avatar"
              >
                Avatar / scenario
              </label>
              <SearchSelect
                id="training-avatar"
                value={avatarId}
                onChange={(value) => {
                  setAvatarId(value)
                  setSelectedUserIds(new Set())
                  setFormSuccess('')
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
              <label
                className="mb-1 block text-xs font-medium text-slate-400"
                htmlFor="training-target"
              >
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
              <label
                className="mb-1 block text-xs font-medium text-slate-400"
                htmlFor="training-due"
              >
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
              {isSaving && <Spinner variant="button" />}
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
        <LoadingState message="Caricamento percorsi..." />
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
                      <TrashIcon size={15} />
                    </button>
                  </Tooltip>
                </Td>
              )}
            </Tr>
          ))}
        </DataTable>
      )}
    </PageContainer>
  )
}
