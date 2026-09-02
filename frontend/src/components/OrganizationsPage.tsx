import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useFlashMessage } from '../hooks/useFlashMessage'
import {
  useOrganizations,
  useOrganization,
  useCreateOrganization,
  useUpdateOrganization,
  useSetOrganizationStatus,
  useDeleteOrganization,
} from '../hooks/useOrganizations'
import type { Organization, OrganizationDetail, OrgStatus } from '../services/organizations'
import { isSuperAdmin } from '../services/auth'
import { errorMessage } from '../services/errors'
import DataTable, { Td, Tr } from './DataTable'
import DetailModal, { DetailField } from './DetailModal'
import AuthorshipFields from './AuthorshipFields'
import Tooltip from './Tooltip'
import KebabMenu from './KebabMenu'
import IconButton from './IconButton'
import Spinner from './Spinner'
import LoadError from './LoadError'
import { prefetchOnHover } from './lazyPages'
import OrganizationsFilters from './OrganizationsFilters'
import { STATUS_BADGE_CLASSES, STATUS_LABELS } from './organizationStatus'
import { PageContainer, PageHeader } from './PageLayout'
import TableSkeleton from './TableSkeleton'
import PrimaryButton from './PrimaryButton'
import FormError from './FormError'
import FormSuccess from './FormSuccess'
import ConfirmModal from './ConfirmModal'
import ModalShell, { ModalHeader } from './ModalShell'
import { BuildingIcon, SuspendIcon, ReactivateIcon, TrashIcon, PlusIcon, PencilIcon } from './icons'
import { matchesSearch } from './tableSearch'
import { formatDate, formatDateTime, formatRelativeDay, NEVER_ACCESSED_LABEL } from './dateFormat'
import type { DataTableColumn } from './DataTable'
import Badge from './Badge'
import type { KebabMenuItem } from './KebabMenu'
import Field, { fieldCls, labelCls, inputWrapperCls, inputCls, TextInput } from './Field'

/* Finestra su cui il backend conta le conversazioni recenti
 * (_ACTIVITY_WINDOW_DAYS in routers/organizations.py): serve solo a
 * etichettare il campo, il conteggio arriva già fatto. */
const ACTIVITY_WINDOW_DAYS = 30

/* Righe del dettaglio che il modale carica a parte: link alle altre pagine
 * admin già filtrate su questa organizzazione. Le due tabelle accettano
 * ?organization_id, quindi il salto arriva sul sottoinsieme giusto invece
 * che su un elenco da rifiltrare a mano. */
const detailLinkCls =
  'inline-flex items-center gap-1.5 rounded-lg border border-violet-600/25 bg-violet-600/10 px-3 py-1 text-[0.78rem] font-medium text-violet-300 transition hover:border-violet-600 hover:bg-violet-600/20 hover:text-violet-200'

/* Le percentuali sommano a 100. I due conteggi stanno stretti perché sono
 * numeri dentro una pillola, mentre lo stato ospita anche il motivo di una
 * sospensione sotto la targhetta. */
const ORG_COLUMNS: DataTableColumn<Organization>[] = [
  { key: 'org', label: 'Organizzazione', width: '21%', sortValue: (o) => o.name },
  { key: 'slug', label: 'Slug', width: '16%', sortValue: (o) => o.slug },
  { key: 'utenti', label: 'Utenti', width: '10%', sortValue: (o) => o.user_count },
  { key: 'avatar', label: 'Avatar', width: '10%', sortValue: (o) => o.avatar_count },
  /* Sullo stato si ordina per l'etichetta che si legge e non per il codice
     salvato: chi ordina si aspetta l'ordine delle parole che vede. */
  {
    key: 'stato',
    label: 'Stato',
    width: '16%',
    sortValue: (o) => STATUS_LABELS[o.status] ?? o.status,
  },
  { key: 'creazione', label: 'Data Creazione', width: '12%', sortValue: (o) => o.created_at },
  { key: 'azioni', label: 'Azioni', width: '15%' },
]

const suspendIcon = <SuspendIcon />
const reactivateIcon = <ReactivateIcon />
/* L'icona della modale è la stessa del menu, alla misura grande e nel rosso
 * dell'azione distruttiva. */
const deleteIcon = <TrashIcon size={24} stroke="#ef4444" />

/* L'edificio che intesta le finestre di questa pagina: è la stessa icona che
 * la voce «Gestione Organizzazioni» mostra nel menu del profilo, e non un
 * disegno che le somiglia ricopiato qui dentro. */
const orgIcon = <BuildingIcon size={24} stroke="#7c3aed" />
const orgDetailIcon = (
  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-600/20 bg-violet-600/10">
    <BuildingIcon size={22} stroke="#7c3aed" />
  </div>
)

export default function OrganizationsPage() {
  const { user } = useAuth()
  const {
    data: orgs = [],
    isPending: isLoading,
    error: loadError,
    refetch: reloadOrgs,
  } = useOrganizations(isSuperAdmin(user))
  const { message: successMsg, flash: flashSuccess } = useFlashMessage()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  /* L'elenco è corto e arriva tutto insieme, quindi filtro e ricerca girano
     qui: al server si chiederebbe la stessa manciata di righe per ogni tasto
     premuto. */
  const visibleOrgs = orgs.filter(
    (o) =>
      (!statusFilter || o.status === statusFilter) &&
      matchesSearch(search, o.name, o.slug, STATUS_LABELS[o.status] ?? o.status),
  )

  /* Anche la ricerca è un filtro, benché la casella stia dentro la tabella:
     «Azzera Filtri» riporta l'elenco completo, quindi comprende pure quella e
     compare anche quando è l'unica cosa attiva. */
  const hasFilters = Boolean(search || statusFilter)
  const resetFilters = () => {
    setSearch('')
    setStatusFilter('')
  }

  // Detail view (clic sulla riga): organizzazione in sola lettura. La riga
  // già in tabella si mostra subito, le statistiche di utilizzo arrivano
  // dopo perché costano una scansione delle conversazioni del tenant.
  const [viewingOrg, setViewingOrg] = useState<Organization | null>(null)
  /* Il dettaglio è una query sull'organizzazione aperta: una risposta in
   * ritardo su un dettaglio già chiuso, o riaperto su un'altra riga, non
   * arriva sullo schermo perché quella query non è più quella attiva. */
  const {
    data: detail,
    error: detailError,
    refetch: reloadDetail,
  } = useOrganization(viewingOrg?.id ?? null)

  /* I tre campi che arrivano dopo il resto hanno gli stessi tre stati:
     l'attesa, il valore, e il trattino di quando la lettura è fallita. Il
     perché di quel trattino lo dice il fondo della modale, una volta sola
     invece che su ogni riga. */
  const usageField = (label: string, value: (d: OrganizationDetail) => ReactNode) => (
    <DetailField label={label}>
      {detailError ? (
        <span className="text-slate-500">—</span>
      ) : detail ? (
        value(detail)
      ) : (
        <Spinner variant="button" />
      )}
    </DetailField>
  )

  // Create/edit modal: 'new' = create, Organization = edit, null = closed
  const [editing, setEditing] = useState<Organization | 'new' | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')

  // Delete confirmation
  const [deleting, setDeleting] = useState<Organization | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // Status change confirmation
  const [statusAction, setStatusAction] = useState<{ org: Organization; target: OrgStatus } | null>(
    null,
  )
  const [statusReason, setStatusReason] = useState('')

  const createMutation = useCreateOrganization()
  const updateMutation = useUpdateOrganization()
  const statusMutation = useSetOrganizationStatus()
  const deleteMutation = useDeleteOrganization()

  /* Gli errori delle scritture vivono nelle mutation, non in stati paralleli:
   * `reset()` all'apertura di una modale è quello che prima faceva un
   * setState a vuoto. Salvare crea o aggiorna, quindi l'attesa e l'errore
   * del form sono quelli della mutation che sta girando. */
  const isSaving = createMutation.isPending || updateMutation.isPending
  const formError = errorMessage(
    createMutation.error ?? updateMutation.error,
    'Errore durante il salvataggio.',
  )

  const openDetail = (org: Organization) => setViewingOrg(org)
  const closeDetail = () => setViewingOrg(null)

  const openStatusChange = (org: Organization, target: OrgStatus) => {
    statusMutation.reset()
    setStatusReason('')
    setStatusAction({ org, target })
  }

  const openCreate = () => {
    setName('')
    setSlug('')
    createMutation.reset()
    updateMutation.reset()
    setEditing('new')
  }

  const openEdit = (o: Organization) => {
    setName(o.name)
    setSlug(o.slug)
    createMutation.reset()
    updateMutation.reset()
    setEditing(o)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editing === 'new') {
        const created = await createMutation.mutateAsync({
          name,
          slug: slug.trim() || undefined,
        })
        flashSuccess(`Organizzazione ${created.name} creata con successo.`)
      } else if (editing) {
        const updated = await updateMutation.mutateAsync({
          organizationId: editing.id,
          payload: { name, slug: slug.trim() || undefined },
        })
        flashSuccess(`Organizzazione ${updated.name} aggiornata con successo.`)
      }
      setEditing(null)
    } catch {
      // Il messaggio è già nella mutation, la modale resta aperta per
      // mostrarlo e per lasciar correggere quello che si stava scrivendo.
    }
  }

  const handleConfirmStatus = async () => {
    if (!statusAction) return
    try {
      const updated = await statusMutation.mutateAsync({
        organizationId: statusAction.org.id,
        status: statusAction.target,
        reason: statusReason,
      })
      setStatusAction(null)
      setStatusReason('')
      flashSuccess(
        `Organizzazione ${updated.name} ${statusAction.target === 'active' ? 'riattivata' : 'sospesa'}.`,
      )
    } catch {
      // idem: l'errore lo mostra la modale
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleting) return
    try {
      const result = await deleteMutation.mutateAsync(deleting.id)
      setDeleting(null)
      setDeleteConfirmText('')
      flashSuccess(result.message)
    } catch {
      // idem
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Gestione Organizzazioni"
        description="Crea, sospendi ed elimina le organizzazioni che usano la piattaforma."
        actions={
          <PrimaryButton icon={<PlusIcon />} onClick={openCreate}>
            Nuova Organizzazione
          </PrimaryButton>
        }
      />

      <OrganizationsFilters
        value={statusFilter}
        isSearching={Boolean(search)}
        onChange={setStatusFilter}
        onReset={resetFilters}
      />

      {successMsg && <FormSuccess message={successMsg} variant="page" />}

      {/* Un elenco che non è arrivato non è un elenco vuoto: senza il riquadro
          qui sotto la tabella direbbe che non c'è nessuna organizzazione, e
          l'unica via d'uscita sarebbe ricaricare la pagina. */}
      {loadError ? (
        <LoadError
          message={errorMessage(loadError, 'Impossibile caricare le organizzazioni.')}
          onRetry={reloadOrgs}
          variant="page"
        />
      ) : isLoading ? (
        <TableSkeleton columns={ORG_COLUMNS} message="Caricamento organizzazioni..." />
      ) : (
        <DataTable
          columns={ORG_COLUMNS}
          items={visibleOrgs}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Cerca per nome, slug o stato..."
          /* Filtrare cambia l'elenco, e restare alla terza pagina di quello
             di prima vuol dire guardare una pagina che non esiste più. */
          pageResetKey={`${statusFilter}|${search}`}
          emptyMessage={
            hasFilters
              ? 'Nessuna organizzazione corrisponde ai filtri'
              : 'Nessuna organizzazione presente. Crea la prima con "Nuova Organizzazione"'
          }
          renderRow={(o) => {
            const menuItems: KebabMenuItem[] = [
              {
                key: 'toggle',
                label:
                  o.status === 'suspended' ? 'Riattiva Organizzazione' : 'Sospendi Organizzazione',
                icon: o.status === 'suspended' ? reactivateIcon : suspendIcon,
                onSelect: () =>
                  openStatusChange(o, o.status === 'suspended' ? 'active' : 'suspended'),
              },
            ]
            return (
              /* `onActivate` e non un `onClick`: la riga si apre anche da
                 tastiera, col fuoco e con Invio, come nelle altre tabelle.

                 Niente velatura su un tenant sospeso: lo stato è già scritto
                 nella sua colonna, e attenuare tutta la riga portava il motivo
                 della sospensione, che è grigio di suo, sotto la soglia in cui
                 si legge. */
              <Tr key={o.id} onActivate={() => openDetail(o)}>
                <Td>
                  <span className="font-semibold text-slate-100">{o.name}</span>
                </Td>
                <Td>
                  <code className="rounded-lg bg-white/5 px-2 py-1 text-xs text-violet-400">
                    {o.slug}
                  </code>
                </Td>
                <Td>
                  <span className="inline-block min-w-8 rounded-full border border-white/6 bg-white/4 px-2 py-0.5 text-[0.8rem] font-semibold text-slate-100">
                    {o.user_count}
                  </span>
                </Td>
                <Td>
                  <span className="inline-block min-w-8 rounded-full border border-white/6 bg-white/4 px-2 py-0.5 text-[0.8rem] font-semibold text-slate-100">
                    {o.avatar_count}
                  </span>
                </Td>
                <Td>
                  <div className="flex flex-col items-center gap-1">
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
                  <span className="whitespace-nowrap text-[0.85rem] tabular-nums text-slate-500">
                    {formatDate(o.created_at)}
                  </span>
                </Td>
                <Td onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-2">
                    <IconButton
                      label={`Modifica ${o.name}`}
                      tooltip="Modifica Organizzazione"
                      onClick={() => openEdit(o)}
                    >
                      <PencilIcon />
                    </IconButton>
                    <IconButton
                      tone="danger"
                      label={`Elimina ${o.name}`}
                      tooltip="Elimina l'organizzazione con tutti i suoi dati"
                      onClick={() => {
                        deleteMutation.reset()
                        setDeleteConfirmText('')
                        setDeleting(o)
                      }}
                    >
                      <TrashIcon />
                    </IconButton>
                    <Tooltip wrap content="Altre azioni">
                      <KebabMenu label={`Altre azioni per ${o.name}`} items={menuItems} />
                    </Tooltip>
                  </div>
                </Td>
              </Tr>
            )
          }}
        />
      )}

      {/* Dettaglio Organizzazione (clic sulla riga) */}
      {viewingOrg && (
        <DetailModal
          onClose={closeDetail}
          title={viewingOrg.name}
          subtitle={<code className="text-violet-400">{viewingOrg.slug}</code>}
          header={orgDetailIcon}
          /* Le statistiche sono l'unica parte del dettaglio che può mancare, e
             il rimedio sta in fondo alla modale invece che al posto dei
             valori: il tenant, i suoi conteggi e i salti alle altre pagine
             restano leggibili mentre si riprova. */
          footer={
            detailError ? (
              <LoadError
                message="Statistiche di utilizzo non disponibili."
                onRetry={reloadDetail}
                className="w-full"
              />
            ) : undefined
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
            <DetailField label="Motivo Sospensione">{viewingOrg.suspension_reason}</DetailField>
          )}
          <DetailField label="Utenti">
            <div className="flex items-center justify-end gap-3">
              <span>{viewingOrg.user_count}</span>
              <Link
                to={`/app/admin?organization_id=${viewingOrg.id}`}
                {...prefetchOnHover('/app/admin')}
                onClick={closeDetail}
                className={detailLinkCls}
              >
                Apri Elenco
              </Link>
            </div>
          </DetailField>
          <DetailField label="Avatar">
            <div className="flex items-center justify-end gap-3">
              <span>{viewingOrg.avatar_count}</span>
              <Link
                to={`/app/admin/avatars?organization_id=${viewingOrg.id}`}
                {...prefetchOnHover('/app/admin/avatars')}
                onClick={closeDetail}
                className={detailLinkCls}
              >
                Apri Elenco
              </Link>
            </div>
          </DetailField>
          {/* Utilizzo: arriva dopo il resto, quindi finché non c'è la modale
              mostra comunque i dati che la tabella aveva già. */}
          {usageField(`Conversazioni (${ACTIVITY_WINDOW_DAYS} gg)`, (d) => (
            <>
              {d.conversations_last_30_days}
              <span className="text-slate-500"> su {d.conversations_total} totali</span>
            </>
          ))}
          {usageField('Punteggio Medio', (d) =>
            d.average_score === null ? (
              <span className="text-slate-500">Nessuna valutazione</span>
            ) : (
              <>
                {d.average_score.toFixed(1)}
                <span className="text-slate-500">
                  {' '}
                  su {d.evaluated_count}{' '}
                  {d.evaluated_count === 1 ? 'conversazione' : 'conversazioni'}
                </span>
              </>
            ),
          )}
          {usageField('Ultimo Accesso', (d) =>
            d.last_login_at ? (
              <Tooltip content={formatDateTime(d.last_login_at)}>
                <span>{formatRelativeDay(d.last_login_at)}</span>
              </Tooltip>
            ) : (
              <span className="text-slate-500">{NEVER_ACCESSED_LABEL}</span>
            ),
          )}
          <AuthorshipFields row={viewingOrg} />
          <DetailField label="ID Organizzazione" mono>
            {viewingOrg.id}
          </DetailField>
        </DetailModal>
      )}

      {/* Modal Crea/Modifica Organizzazione */}
      {editing && (
        <ModalShell onClose={() => setEditing(null)} locked={isSaving}>
          <ModalHeader
            iconWrapperCls="border border-violet-600/20 bg-violet-600/10"
            icon={orgIcon}
            title={editing === 'new' ? 'Crea Nuova Organizzazione' : `Modifica ${editing.name}`}
            /* In creazione lo slug si ricava dal nome, in modifica resta
               quello che c'è: la stessa frase per entrambi prometteva che
               svuotare il campo lo facesse ricalcolare, e non è così. */
            description={
              editing === 'new'
                ? 'Lo slug è generato automaticamente dal nome se lasciato vuoto.'
                : 'Lo slug lasciato vuoto resta quello attuale.'
            }
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
                L'accesso viene sospeso per tutti gli utenti di{' '}
                <strong className="text-slate-100">{statusAction.org.name}</strong>: il login viene
                impedito e le sessioni aperte chiuse immediatamente. L'operazione è reversibile.
              </>
            )
          }
          error={
            errorMessage(
              statusMutation.error,
              "Errore durante il cambio di stato dell'organizzazione.",
            ) || undefined
          }
          confirmLabel={statusAction.target === 'active' ? 'Riattiva' : 'Sospendi'}
          pendingLabel="Attendere..."
          confirmClassName={
            statusAction.target === 'active'
              ? 'border border-emerald-500/35 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
              : 'border border-amber-500/35 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
          }
          isPending={statusMutation.isPending}
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
                  placeholder="Es. Contratto scaduto, contattare il proprio referente."
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  disabled={statusMutation.isPending}
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
          /* L'elenco dice tutto quello che l'endpoint porta via, test
             tecnici e percorsi compresi: chi conferma sta cancellando anche
             il lavoro che l'organizzazione ha composto, non solo le persone
             e le loro conversazioni. */
          description={
            <>
              Stai per eliminare <strong className="text-slate-100">{deleting.name}</strong> con{' '}
              <strong className="text-slate-100">{deleting.user_count} utenti</strong> (rimossi
              anche da Cognito), tutte le loro conversazioni, i{' '}
              <strong className="text-slate-100">{deleting.avatar_count} avatar privati</strong>{' '}
              dell'organizzazione e i test tecnici e i percorsi formativi che le appartengono.
              L'operazione non è reversibile. Scrivi{' '}
              <strong className="text-slate-100">{deleting.name}</strong> per confermare.
            </>
          }
          error={
            errorMessage(
              deleteMutation.error,
              "Errore durante l'eliminazione dell'organizzazione.",
            ) || undefined
          }
          confirmLabel="Elimina Definitivamente"
          pendingLabel="Eliminazione..."
          confirmClassName="border-none bg-red-500 text-white hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)]"
          isPending={deleteMutation.isPending}
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
                disabled={deleteMutation.isPending}
                aria-label="Conferma Nome Organizzazione"
              />
            </div>
          </div>
        </ConfirmModal>
      )}
    </PageContainer>
  )
}
