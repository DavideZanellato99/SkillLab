import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchOrganizations,
  fetchOrganization,
  createOrganization,
  updateOrganization,
  setOrganizationStatus,
  deleteOrganization,
} from '../services/organizations'
import type { Organization, OrganizationDetail, OrgStatus } from '../services/organizations'
import { isSuperAdmin } from '../services/auth'
import DataTable, { Td, Tr } from './DataTable'
import DetailModal, { DetailField } from './DetailModal'
import Select from './Select'
import Tooltip from './Tooltip'
import KebabMenu from './KebabMenu'
import Spinner from './Spinner'
import LoadingState from './LoadingState'
import { PageContainer, PageHeader } from './PageLayout'
import PrimaryButton from './PrimaryButton'
import FormError from './FormError'
import ConfirmModal from './ConfirmModal'
import ModalShell, { ModalHeader } from './ModalShell'
import { SuspendIcon, ReactivateIcon, TrashIcon, PlusIcon } from './icons'
import { matchesSearch } from './tableSearch'
import { formatDateTime, formatRelativeDay, NEVER_ACCESSED_LABEL } from './lastAccess'
import type { DataTableColumn } from './DataTable'
import Badge from './Badge'
import type { KebabMenuItem } from './KebabMenu'
import Field, { fieldCls, labelCls, inputWrapperCls, inputCls, TextInput } from './Field'

/* Shared form styles (same look as the users admin page) */
const actionBtnCls =
  'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/6 bg-white/4 text-slate-400 transition disabled:cursor-not-allowed disabled:opacity-40'

const STATUS_LABELS: Record<OrgStatus, string> = {
  active: 'Attiva',
  suspended: 'Sospesa',
}

/* Finestra su cui il backend conta le conversazioni recenti
 * (_ACTIVITY_WINDOW_DAYS in routers/organizations.py): serve solo a
 * etichettare il campo, il conteggio arriva già fatto. */
const ACTIVITY_WINDOW_DAYS = 30

const STATUS_OPTIONS = [
  { value: '', label: 'Tutti gli stati' },
  ...(Object.keys(STATUS_LABELS) as OrgStatus[]).map((s) => ({
    value: s,
    label: STATUS_LABELS[s],
  })),
]

/* Righe del dettaglio che il modale carica a parte: link alle altre pagine
 * admin già filtrate su questa organizzazione. Le due tabelle accettano
 * ?organization_id, quindi il salto arriva sul sottoinsieme giusto invece
 * che su un elenco da rifiltrare a mano. */
const detailLinkCls =
  'inline-flex items-center gap-1.5 rounded-lg border border-violet-600/25 bg-violet-600/10 px-3 py-1 text-[0.78rem] font-medium text-violet-300 transition hover:border-violet-600 hover:bg-violet-600/20 hover:text-violet-200'

const STATUS_BADGE_CLASSES: Record<OrgStatus, string> = {
  active: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  suspended: 'border border-amber-500/30 bg-amber-500/10 text-amber-400',
}

const ORG_COLUMNS: DataTableColumn[] = [
  { key: 'org', label: 'Organizzazione' },
  { key: 'slug', label: 'Slug' },
  { key: 'utenti', label: 'Utenti', align: 'center' },
  { key: 'avatar', label: 'Avatar', align: 'center' },
  { key: 'stato', label: 'Stato' },
  { key: 'creazione', label: 'Data Creazione' },
  { key: 'azioni', label: 'Azioni', align: 'right' },
]

const suspendIcon = <SuspendIcon />
const reactivateIcon = <ReactivateIcon />
/* L'icona della modale è la stessa del menu, alla misura grande e nel rosso
 * dell'azione distruttiva. */
const deleteIcon = <TrashIcon size={24} stroke="#ef4444" />

export default function OrganizationsPage() {
  const { user } = useAuth()
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const visibleOrgs = orgs.filter(
    (o) =>
      (!statusFilter || o.status === statusFilter) &&
      matchesSearch(search, o.name, o.slug, STATUS_LABELS[o.status] ?? o.status),
  )

  // Detail view (clic sulla riga): organizzazione in sola lettura. La riga
  // già in tabella si mostra subito, le statistiche di utilizzo arrivano
  // dopo perché costano una scansione delle conversazioni del tenant.
  const [viewingOrg, setViewingOrg] = useState<Organization | null>(null)
  const [detail, setDetail] = useState<OrganizationDetail | null>(null)
  const [detailError, setDetailError] = useState('')
  /** Organizzazione di cui è in volo la richiesta di dettaglio. */
  const detailRequestRef = useRef<string | null>(null)

  // Create/edit modal: 'new' = create, Organization = edit, null = closed
  const [editing, setEditing] = useState<Organization | 'new' | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Delete confirmation
  const [deleting, setDeleting] = useState<Organization | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // Status change confirmation
  const [statusAction, setStatusAction] = useState<{ org: Organization; target: OrgStatus } | null>(
    null,
  )
  const [statusReason, setStatusReason] = useState('')
  const [isSavingStatus, setIsSavingStatus] = useState(false)
  const [statusError, setStatusError] = useState('')

  const flashSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 6000)
  }

  const loadOrgs = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const data = await fetchOrganizations()
      setOrgs(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile caricare le organizzazioni.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isSuperAdmin(user)) {
      loadOrgs()
    }
  }, [user, loadOrgs])

  /* Statistiche del tenant: si leggono all'apertura del dettaglio e non con
   * l'elenco, così la tabella (e i menu a tendina che usano lo stesso
   * endpoint altrove) non pagano una scansione delle conversazioni. */
  const openDetail = async (org: Organization) => {
    setViewingOrg(org)
    setDetail(null)
    setDetailError('')
    detailRequestRef.current = org.id
    try {
      const data = await fetchOrganization(org.id)
      // Una risposta in ritardo non deve comparire in un dettaglio che nel
      // frattempo è stato chiuso, o aperto su un'altra organizzazione.
      if (detailRequestRef.current === org.id) setDetail(data)
    } catch (err) {
      if (detailRequestRef.current === org.id) {
        setDetailError(err instanceof Error ? err.message : 'Statistiche non disponibili.')
      }
    }
  }

  const closeDetail = () => {
    detailRequestRef.current = null
    setViewingOrg(null)
    setDetail(null)
    setDetailError('')
  }

  const openStatusChange = (org: Organization, target: OrgStatus) => {
    setStatusError('')
    setStatusReason('')
    setStatusAction({ org, target })
  }

  const openCreate = () => {
    setName('')
    setSlug('')
    setFormError('')
    setEditing('new')
  }

  const openEdit = (o: Organization) => {
    setName(o.name)
    setSlug(o.slug)
    setFormError('')
    setEditing(o)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setIsSaving(true)
    try {
      if (editing === 'new') {
        const created = await createOrganization({ name, slug: slug.trim() || undefined })
        setOrgs((prev) => [created, ...prev])
        flashSuccess(`Organizzazione ${created.name} creata con successo.`)
      } else if (editing) {
        const updated = await updateOrganization(editing.id, {
          name,
          slug: slug.trim() || undefined,
        })
        setOrgs((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
        flashSuccess(`Organizzazione ${updated.name} aggiornata con successo.`)
      }
      setEditing(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Errore durante il salvataggio.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleConfirmStatus = async () => {
    if (!statusAction) return
    setStatusError('')
    setIsSavingStatus(true)
    try {
      const updated = await setOrganizationStatus(
        statusAction.org.id,
        statusAction.target,
        statusReason,
      )
      setOrgs((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
      setStatusAction(null)
      setStatusReason('')
      flashSuccess(
        `Organizzazione ${updated.name} ${statusAction.target === 'active' ? 'riattivata' : 'sospesa'}.`,
      )
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Errore durante il cambio di stato.')
    } finally {
      setIsSavingStatus(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleting) return
    setDeleteError('')
    setIsDeleting(true)
    try {
      const result = await deleteOrganization(deleting.id)
      setOrgs((prev) => prev.filter((o) => o.id !== deleting.id))
      setDeleting(null)
      setDeleteConfirmText('')
      flashSuccess(result.message)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Errore durante l'eliminazione.")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Gestione Organizzazioni"
        description="Crea, sospendi ed elimina le organizzazioni che usano la piattaforma."
        actions={
          <PrimaryButton icon={<PlusIcon size={18} />} onClick={openCreate}>
            Nuova Organizzazione
          </PrimaryButton>
        }
      />

      <div className="mb-8 flex flex-wrap items-end gap-4">
        <div className={fieldCls}>
          <label className={labelCls} htmlFor="orgs-status-filter">
            Stato
          </label>
          <Select
            id="orgs-status-filter"
            className="min-w-[180px]"
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
          />
        </div>
        {statusFilter && (
          <button
            type="button"
            className="cursor-pointer rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100"
            onClick={() => setStatusFilter('')}
          >
            Azzera filtri
          </button>
        )}
      </div>

      {successMsg && (
        <div className="mb-8 flex animate-fade-in-up items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-4 text-sm text-emerald-400 [animation-duration:0.2s]">
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
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>{successMsg}</span>
        </div>
      )}

      {error && <FormError message={error} />}

      {isLoading ? (
        <LoadingState message="Caricamento organizzazioni..." />
      ) : (
        <DataTable
          columns={ORG_COLUMNS}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Cerca per nome, slug o stato..."
          isEmpty={visibleOrgs.length === 0}
          emptyMessage={
            search || statusFilter
              ? 'Nessuna organizzazione corrisponde ai filtri.'
              : 'Nessuna organizzazione presente. Crea la prima con "Nuova Organizzazione".'
          }
        >
          {visibleOrgs.map((o) => {
            const menuItems: KebabMenuItem[] = [
              {
                key: 'toggle',
                label:
                  o.status === 'suspended' ? 'Riattiva organizzazione' : 'Sospendi organizzazione',
                icon: o.status === 'suspended' ? reactivateIcon : suspendIcon,
                onSelect: () =>
                  openStatusChange(o, o.status === 'suspended' ? 'active' : 'suspended'),
              },
            ]
            return (
              <Tr
                key={o.id}
                className={`cursor-pointer ${o.status === 'active' ? '' : 'opacity-60'}`}
                onClick={() => openDetail(o)}
              >
                <Td>
                  <span className="font-semibold text-slate-100">{o.name}</span>
                </Td>
                <Td>
                  <code className="rounded-lg bg-white/5 px-2 py-1 text-xs text-violet-400">
                    {o.slug}
                  </code>
                </Td>
                <Td align="center">
                  <span className="inline-block min-w-8 rounded-full border border-white/6 bg-white/4 px-2 py-0.5 text-[0.8rem] font-semibold text-slate-100">
                    {o.user_count}
                  </span>
                </Td>
                <Td align="center">
                  <span className="inline-block min-w-8 rounded-full border border-white/6 bg-white/4 px-2 py-0.5 text-[0.8rem] font-semibold text-slate-100">
                    {o.avatar_count}
                  </span>
                </Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    <Badge tone={STATUS_BADGE_CLASSES[o.status] ?? ''}>
                      {STATUS_LABELS[o.status] ?? o.status}
                    </Badge>
                    {/* Il motivo sta accanto allo stato che spiega: cercarlo
                        nel dettaglio vorrebbe dire aprire riga per riga. */}
                    {o.status === 'suspended' && o.suspension_reason && (
                      <Tooltip truncateOnly content={o.suspension_reason}>
                        <span className="block max-w-[180px] truncate text-[0.72rem] text-slate-500">
                          {o.suspension_reason}
                        </span>
                      </Tooltip>
                    )}
                  </div>
                </Td>
                <Td>
                  <span className="text-[0.85rem] text-slate-500">
                    {new Date(o.created_at).toLocaleDateString('it-IT', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </Td>
                <Td onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    <Tooltip content="Modifica organizzazione">
                      <button
                        className={`${actionBtnCls} hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400`}
                        onClick={() => openEdit(o)}
                        aria-label={`Modifica ${o.name}`}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      </button>
                    </Tooltip>
                    <Tooltip wrap content="Elimina organizzazione con tutti i suoi dati">
                      <button
                        className={`${actionBtnCls} hover:border-red-500 hover:bg-red-500/10 hover:text-red-500`}
                        onClick={() => {
                          setDeleteError('')
                          setDeleteConfirmText('')
                          setDeleting(o)
                        }}
                        aria-label={`Elimina ${o.name}`}
                      >
                        <TrashIcon />
                      </button>
                    </Tooltip>
                    <Tooltip wrap content="Altre azioni">
                      <KebabMenu
                        label={`Altre azioni per ${o.name}`}
                        items={menuItems}
                        buttonClassName={`${actionBtnCls} hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400`}
                      />
                    </Tooltip>
                  </div>
                </Td>
              </Tr>
            )
          })}
        </DataTable>
      )}

      {/* Dettaglio Organizzazione (clic sulla riga) */}
      {viewingOrg && (
        <DetailModal
          onClose={closeDetail}
          title={viewingOrg.name}
          subtitle={<code className="text-violet-400">{viewingOrg.slug}</code>}
          header={
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-600/20 bg-violet-600/10">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#7c3aed"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" />
              </svg>
            </div>
          }
        >
          <DetailField label="Nome">{viewingOrg.name}</DetailField>
          <DetailField label="Slug">
            <code className="rounded-lg bg-white/5 px-2 py-1 text-xs text-violet-400">
              {viewingOrg.slug}
            </code>
          </DetailField>
          <DetailField label="Stato">
            <Badge tone={STATUS_BADGE_CLASSES[viewingOrg.status] ?? ''}>
              {STATUS_LABELS[viewingOrg.status] ?? viewingOrg.status}
            </Badge>
          </DetailField>
          {viewingOrg.status === 'suspended' && viewingOrg.suspension_reason && (
            <DetailField label="Motivo sospensione">{viewingOrg.suspension_reason}</DetailField>
          )}
          <DetailField label="Utenti">
            <div className="flex items-center justify-end gap-3">
              <span>{viewingOrg.user_count}</span>
              <Link
                to={`/admin?organization_id=${viewingOrg.id}`}
                onClick={closeDetail}
                className={detailLinkCls}
              >
                Apri elenco
              </Link>
            </div>
          </DetailField>
          <DetailField label="Avatar">
            <div className="flex items-center justify-end gap-3">
              <span>{viewingOrg.avatar_count}</span>
              <Link
                to={`/admin/avatars?organization_id=${viewingOrg.id}`}
                onClick={closeDetail}
                className={detailLinkCls}
              >
                Apri elenco
              </Link>
            </div>
          </DetailField>
          {/* Utilizzo: arriva dopo il resto, quindi finché non c'è la modale
              mostra comunque i dati che la tabella aveva già. */}
          <DetailField label={`Conversazioni (${ACTIVITY_WINDOW_DAYS} gg)`}>
            {detailError ? (
              <span className="text-slate-500">—</span>
            ) : detail ? (
              <>
                {detail.conversations_last_30_days}
                <span className="text-slate-500"> su {detail.conversations_total} totali</span>
              </>
            ) : (
              <Spinner variant="button" />
            )}
          </DetailField>
          <DetailField label="Punteggio medio">
            {detailError ? (
              <span className="text-slate-500">—</span>
            ) : detail ? (
              detail.average_score === null ? (
                <span className="text-slate-500">Nessuna valutazione</span>
              ) : (
                <>
                  {detail.average_score.toFixed(1)}
                  <span className="text-slate-500">
                    {' '}
                    su {detail.evaluated_count}{' '}
                    {detail.evaluated_count === 1 ? 'conversazione' : 'conversazioni'}
                  </span>
                </>
              )
            ) : (
              <Spinner variant="button" />
            )}
          </DetailField>
          <DetailField label="Ultimo accesso">
            {detailError ? (
              <span className="text-slate-500">—</span>
            ) : detail ? (
              detail.last_login_at ? (
                <Tooltip content={formatDateTime(detail.last_login_at)}>
                  <span>{formatRelativeDay(detail.last_login_at)}</span>
                </Tooltip>
              ) : (
                <span className="text-slate-500">{NEVER_ACCESSED_LABEL}</span>
              )
            ) : (
              <Spinner variant="button" />
            )}
          </DetailField>
          <DetailField label="Data creazione">
            {new Date(viewingOrg.created_at).toLocaleString('it-IT', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </DetailField>
          <DetailField label="Ultimo aggiornamento">
            {new Date(viewingOrg.updated_at).toLocaleString('it-IT', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </DetailField>
          <DetailField label="ID organizzazione" mono>
            {viewingOrg.id}
          </DetailField>
        </DetailModal>
      )}

      {/* Modal Crea/Modifica Organizzazione */}
      {editing && (
        <ModalShell onClose={() => setEditing(null)} locked={isSaving}>
          <ModalHeader
            iconWrapperCls="border border-violet-600/20 bg-violet-600/10"
            icon={
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
                <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" />
              </svg>
            }
            title="{editing === 'new' ? 'Crea Nuova Organizzazione' : `Modifica ${editing.name}`}"
            description={<>Lo slug è generato automaticamente dal nome se lasciato vuoto.</>}
            className="mb-8"
          />

          {formError && <FormError message={formError} />}

          <form className="flex flex-col gap-4" onSubmit={handleSave}>
            <Field label="Nome" htmlFor="org-name">
              <TextInput
                type="text"
                id="org-name"
                placeholder="Banca Esempio S.p.A."
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isSaving}
              />
            </Field>
            <Field label="Slug (opzionale)" htmlFor="org-slug">
              <TextInput
                type="text"
                id="org-slug"
                placeholder="banca-esempio"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={isSaving}
              />
            </Field>

            <PrimaryButton type="submit" variant="submit" className="mt-4" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Spinner variant="button" />
                  Salvataggio...
                </>
              ) : editing === 'new' ? (
                'Crea Organizzazione'
              ) : (
                'Salva Modifiche'
              )}
            </PrimaryButton>
          </form>
        </ModalShell>
      )}

      {/* Modal Conferma Cambio Stato */}
      {statusAction && (
        <ConfirmModal
          icon={statusAction.target === 'active' ? reactivateIcon : suspendIcon}
          iconWrapperCls={
            statusAction.target === 'active'
              ? 'border border-emerald-500/25 bg-emerald-500/10'
              : 'border border-amber-500/25 bg-amber-500/10'
          }
          title={
            statusAction.target === 'active' ? 'Riattiva Organizzazione' : 'Sospendi Organizzazione'
          }
          description={
            statusAction.target === 'active' ? (
              <>
                L'organizzazione <strong className="text-slate-100">{statusAction.org.name}</strong>{' '}
                torna attiva: i suoi utenti potranno accedere di nuovo.
              </>
            ) : (
              <>
                Blocchi l'accesso a tutti gli utenti di{' '}
                <strong className="text-slate-100">{statusAction.org.name}</strong>: il login viene
                impedito e le sessioni aperte chiuse subito. È reversibile.
              </>
            )
          }
          error={statusError}
          confirmLabel={statusAction.target === 'active' ? 'Riattiva' : 'Sospendi'}
          pendingLabel="Attendere..."
          confirmClassName={
            statusAction.target === 'active'
              ? 'border border-emerald-500/35 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
              : 'border border-amber-500/35 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
          }
          isPending={isSavingStatus}
          onConfirm={handleConfirmStatus}
          onClose={() => setStatusAction(null)}
        >
          {/* Il motivo lo leggono gli utenti bloccati al posto del muro
              generico, quindi si scrive qui, nel momento in cui la
              decisione viene presa. */}
          {statusAction.target === 'suspended' && (
            <div className={`${fieldCls} mb-4`}>
              <label className={labelCls} htmlFor="org-suspension-reason">
                Motivo (opzionale, visibile agli utenti)
              </label>
              <div className={inputWrapperCls}>
                <textarea
                  id="org-suspension-reason"
                  className={`${inputCls} resize-none`}
                  rows={2}
                  maxLength={500}
                  placeholder="Es. Contratto scaduto, contatta il tuo referente."
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  disabled={isSavingStatus}
                />
              </div>
            </div>
          )}
        </ConfirmModal>
      )}

      {/* Modal Conferma Eliminazione */}
      {deleting && (
        <ConfirmModal
          icon={deleteIcon}
          iconWrapperCls="border border-red-500/25 bg-red-500/10"
          title="Elimina Organizzazione"
          description={
            <>
              Stai per eliminare <strong className="text-slate-100">{deleting.name}</strong> con{' '}
              <strong className="text-slate-100">{deleting.user_count} utenti</strong> (rimossi
              anche da Cognito), tutte le loro conversazioni e i{' '}
              <strong className="text-slate-100">{deleting.avatar_count} avatar privati</strong>{' '}
              dell'organizzazione. L'operazione non è reversibile. Scrivi{' '}
              <strong className="text-slate-100">{deleting.name}</strong> per confermare.
            </>
          }
          error={deleteError}
          confirmLabel="Elimina Definitivamente"
          pendingLabel="Eliminazione..."
          confirmClassName="border-none bg-red-500 text-white hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)]"
          isPending={isDeleting}
          confirmDisabled={deleteConfirmText.trim() !== deleting.name}
          onConfirm={handleConfirmDelete}
          onClose={() => setDeleting(null)}
        >
          <div className={`${fieldCls} mb-4`}>
            <div className={inputWrapperCls}>
              <input
                type="text"
                className={inputCls}
                placeholder={deleting.name}
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                disabled={isDeleting}
                aria-label="Conferma nome organizzazione"
              />
            </div>
          </div>
        </ConfirmModal>
      )}
    </PageContainer>
  )
}
