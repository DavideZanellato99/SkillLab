import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../contexts/AuthContext'
import { fetchVoicePreview } from '../services/admin'
import type { AdminAvatar, AdminAvatarPayload } from '../services/admin'
import {
  useAdminAvatars,
  useCreateAvatar,
  useUpdateAvatar,
  useDeleteAvatar,
  useRestoreAvatar,
  useUploadAvatarImage,
  useVoices,
} from '../hooks/useAdminAvatars'
import { useOrganizations } from '../hooks/useOrganizations'
import { isSuperAdmin } from '../services/auth'
import { getAvatarImageUrl } from '../services/api'
import { categoryBadgeClasses } from './categoryStyles'
import Select from './Select'
import DataTable, { Td, Tr } from './DataTable'
import Spinner from './Spinner'
import LoadingState from './LoadingState'
import { PageContainer, PageHeader } from './PageLayout'
import PrimaryButton from './PrimaryButton'
import FormError from './FormError'
import ConfirmModal from './ConfirmModal'
import ModalShell from './ModalShell'
import { TrashIcon, PlusIcon } from './icons'
import Tooltip from './Tooltip'
import PersonaPromptPreview from './PersonaPromptPreview'
import { matchesSearch } from './tableSearch'
import type { DataTableColumn } from './DataTable'
import Badge from './Badge'
import {
  ALL_PROFILE_KEYS,
  PROFILE_SECTIONS,
  countFilled,
  emptyProfile,
  inputToPercent,
  missingEssentials,
  percentToInput,
} from './avatarProfileConfig'
import type { ProfileField } from './avatarProfileConfig'
import { fieldCls, labelCls, inputWrapperCls, inputCls, textareaCls } from './Field'

/* Shared styles (same look as the users admin page) */
const actionBtnCls =
  'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/6 bg-white/4 text-slate-400 transition disabled:cursor-not-allowed disabled:opacity-40'
const sectionTitleCls =
  'mb-3 mt-2 border-b border-white/6 pb-2 text-[0.72rem] font-semibold uppercase tracking-widest text-violet-400'

const AVATAR_COLUMNS: DataTableColumn[] = [
  { key: 'avatar', label: 'Avatar' },
  { key: 'organizzazione', label: 'Organizzazione' },
  { key: 'categoria', label: 'Categoria' },
  { key: 'difficolta', label: 'Difficoltà' },
  { key: 'conversazioni', label: 'Conversazioni', align: 'center' },
  { key: 'azioni', label: 'Azioni', align: 'right' },
]

/* L'eliminazione di un avatar è logica: l'avatar esce dal catalogo degli
 * studenti ma conversazioni, valutazioni e scheda persona restano intatte,
 * quindi la pagina mostra il catalogo per default e tiene l'archivio a
 * portata di filtro, da cui ogni avatar può tornare indietro. */
const STATUS_ACTIVE = 'active'
const STATUS_ARCHIVED = 'archived'

const STATUS_OPTIONS = [
  { value: STATUS_ACTIVE, label: 'In catalogo' },
  { value: STATUS_ARCHIVED, label: 'Archiviati' },
  { value: '', label: 'Tutti' },
]

const archivedDate = (iso: string) =>
  new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })

interface FormState {
  category: string
  description: string
  imageUrl: string
  voiceId: string
  /** Required owning organization id. */
  organizationId: string
  profile: Record<string, string>
}

function emptyForm(): FormState {
  return {
    category: 'Clienti',
    description: '',
    imageUrl: '',
    voiceId: '',
    organizationId: '',
    profile: emptyProfile(),
  }
}

function formFromAvatar(a: AdminAvatar): FormState {
  return {
    category: a.category,
    description: a.description ?? '',
    imageUrl: a.image_url,
    voiceId: a.voice_id ?? '',
    organizationId: a.organization_id,
    profile: { ...emptyProfile(), ...a.profile },
  }
}

/* Un campo della scheda, disegnato secondo il suo tipo.
 *
 * Vale per tutti la stessa regola: si può sempre tornare a vuoto. Il prompt
 * legge le percentuali come intensità di un tratto, quindi uno 0% scritto al
 * posto di un campo lasciato in bianco non è la stessa cosa, dice al modello
 * che quel tratto è assente invece di non dirgli niente. */
function ProfileFieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: ProfileField
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  const id = `pf-${field.key}`
  const label = (
    <label className={labelCls} htmlFor={id}>
      {field.label}
    </label>
  )
  const hint = field.hint && <p className="text-[0.7rem] text-slate-500">{field.hint}</p>

  if (field.kind === 'textarea') {
    return (
      <div className={`${fieldCls} col-span-2 max-[600px]:col-span-1`}>
        {label}
        <textarea
          id={id}
          className={textareaCls}
          rows={2}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        {hint}
      </div>
    )
  }

  if (field.kind === 'choice') {
    const options = field.options ?? []
    // Un valore salvato fuori elenco resta selezionabile: le schede vecchie
    // non devono perdere un dato solo perché oggi proponiamo altre parole.
    const extra = value && !options.includes(value) ? [value] : []
    return (
      <div className={fieldCls}>
        {label}
        <Select
          id={id}
          value={value}
          onChange={onChange}
          options={[
            { value: '', label: 'Non applicabile' },
            ...[...options, ...extra].map((o) => ({ value: o, label: o })),
          ]}
          placeholder="Non applicabile"
          disabled={disabled}
        />
        {hint}
      </div>
    )
  }

  if (field.kind === 'percent') {
    return (
      <div className={fieldCls}>
        {label}
        <div className={inputWrapperCls}>
          <input
            type="text"
            inputMode="numeric"
            id={id}
            className={inputCls}
            placeholder="es. 60"
            value={percentToInput(value)}
            onChange={(e) => onChange(inputToPercent(e.target.value))}
            disabled={disabled}
          />
          <span className="shrink-0 text-sm text-slate-500">%</span>
        </div>
        {hint}
      </div>
    )
  }

  return (
    <div className={fieldCls}>
      {label}
      <div className={inputWrapperCls}>
        <input
          type="text"
          id={id}
          className={inputCls}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </div>
      {hint}
    </div>
  )
}

export default function AvatarAdminPage() {
  const { user } = useAuth()
  const { data: organizations = [] } = useOrganizations(isSuperAdmin(user))
  const [successMsg, setSuccessMsg] = useState('')
  const [search, setSearch] = useState('')

  // Anche gli archiviati: sono una vista di questa stessa tabella.
  const {
    data: avatars = [],
    isPending: isLoading,
    error: loadError,
  } = useAdminAvatars(true, isSuperAdmin(user))

  /* Filtro organizzazione, tenuto anche nell'URL (?organization_id=...): il
   * dettaglio di un'organizzazione linka qui per i suoi avatar, e un
   * ricaricamento o un link condiviso riaprono la pagina già filtrata. */
  const [searchParams, setSearchParams] = useSearchParams()
  const [orgFilter, setOrgFilterValue] = useState(() => searchParams.get('organization_id') ?? '')
  const setOrgFilter = useCallback(
    (value: string) => {
      setOrgFilterValue(value)
      setSearchParams(
        (params) => {
          if (value) params.set('organization_id', value)
          else params.delete('organization_id')
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const [statusFilter, setStatusFilter] = useState<string>(STATUS_ACTIVE)

  // Owning organization options: every avatar belongs to exactly one
  const orgScopeOptions = organizations.map((o) => ({ value: o.id, label: o.name }))

  const matchesStatus = (a: AdminAvatar) =>
    statusFilter === '' ||
    (statusFilter === STATUS_ARCHIVED ? a.deleted_at !== null : a.deleted_at === null)

  const visibleAvatars = avatars.filter(
    (a) =>
      (!orgFilter || a.organization_id === orgFilter) &&
      matchesStatus(a) &&
      matchesSearch(search, a.name, a.description, a.category, a.difficulty),
  )

  const archivedCount = avatars.filter((a) => a.deleted_at !== null).length

  // Modal state: 'new' = create, AdminAvatar = edit, null = closed
  const [editing, setEditing] = useState<AdminAvatar | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  /* La scheda ha due regole che il server non conosce (almeno il nome o il
   * cognome, e l'organizzazione proprietaria): quei messaggi nascono qui e
   * convivono con quelli delle scritture. */
  const [formValidationError, setFormValidationError] = useState('')

  const [deleting, setDeleting] = useState<AdminAvatar | null>(null)

  const createMutation = useCreateAvatar()
  const updateMutation = useUpdateAvatar()
  const deleteMutation = useDeleteAvatar()
  const restoreMutation = useRestoreAvatar()
  const uploadMutation = useUploadAvatarImage()

  /* Il catalogo voci si carica alla prima apertura del form, così chi non
   * tocca mai gli avatar non paga una chiamata al fornitore. Se non risponde,
   * il campo torna a essere un id da incollare a mano invece di bloccare il
   * salvataggio. */
  const [voicesWanted, setVoicesWanted] = useState(false)
  const { data: voices = [], error: voicesQueryError } = useVoices(voicesWanted)
  const voicesError = voicesQueryError ? 'Catalogo voci non disponibile.' : ''
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  /* L'anteprima vocale è un blob riprodotto e buttato, quindi resta fuori
   * dalle query: solo il suo errore va mostrato nel form. */
  const [voicePreviewError, setVoicePreviewError] = useState('')
  const [showPromptPreview, setShowPromptPreview] = useState(false)

  const isSaving = createMutation.isPending || updateMutation.isPending
  const errorOf = (error: unknown, fallback: string) =>
    error ? (error instanceof Error ? error.message : fallback) : ''
  /* Nel form possono fallire quattro cose: la validazione, il caricamento
   * dell'immagine, il salvataggio, l'anteprima vocale. Il banner è uno,
   * quindi mostra la prima che è andata storta. */
  const formError =
    formValidationError ||
    errorOf(uploadMutation.error, "Errore durante il caricamento dell'immagine.") ||
    errorOf(createMutation.error ?? updateMutation.error, 'Errore durante il salvataggio.') ||
    voicePreviewError

  /* Le sezioni della scheda sono otto: aperte tutte insieme sono uno scroll
   * di parecchi schermi, quindi si apre solo quella su cui si sta lavorando.
   * L'anagrafica parte aperta perché è da lì che si comincia sempre. */
  const [openSections, setOpenSections] = useState<string[]>([PROFILE_SECTIONS[0].title])
  const toggleSection = (title: string) =>
    setOpenSections((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title],
    )

  /* Categorie già in uso, per non inventarne una nuova con un refuso: sono
   * suggerimenti, non un elenco chiuso, perché una categoria nuova deve
   * restare possibile senza passare da qui. */
  const knownCategories = Array.from(new Set(avatars.map((a) => a.category).filter(Boolean))).sort()

  /* Voci selezionabili. La prima opzione è "nessuna voce", che il backend
   * risolve nella voce predefinita del .env. Se l'avatar porta un id che il
   * catalogo non contiene più, quell'id resta in elenco: modificare la
   * categoria di un avatar non deve cancellargli la voce di nascosto.
   * Il catalogo arriva già filtrato sulla lingua dell'app, quindi il nome
   * basta: ripetere la lingua su ogni riga sarebbe solo rumore. */
  const voiceOptions = [
    { value: '', label: 'Voce predefinita' },
    ...voices.map((v) => ({ value: v.id, label: v.name })),
    ...(form.voiceId && !voices.some((v) => v.id === form.voiceId)
      ? [{ value: form.voiceId, label: `${form.voiceId} (non nel catalogo)` }]
      : []),
  ]

  const flashSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 6000)
  }

  /** Ripulisce i messaggi delle scritture che il form può aver lasciato. */
  const resetFormErrors = () => {
    setFormValidationError('')
    setVoicePreviewError('')
    uploadMutation.reset()
    createMutation.reset()
    updateMutation.reset()
  }

  const openCreate = () => {
    setForm(emptyForm())
    resetFormErrors()
    setOpenSections([PROFILE_SECTIONS[0].title])
    setVoicesWanted(true)
    setEditing('new')
  }

  const openEdit = (a: AdminAvatar) => {
    setForm(formFromAvatar(a))
    resetFormErrors()
    setOpenSections([PROFILE_SECTIONS[0].title])
    setVoicesWanted(true)
    setEditing(a)
  }

  const setProfileField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, profile: { ...prev.profile, [key]: value } }))
  }

  const handleImageUpload = async (file: File | undefined) => {
    if (!file) return
    resetFormErrors()
    try {
      const { image_url } = await uploadMutation.mutateAsync(file)
      setForm((prev) => ({ ...prev, imageUrl: image_url }))
    } catch {
      // Il messaggio è nella mutation, il banner del form lo mostra
    }
  }

  /* Ascolta una voce prima di assegnarla. L'audio viene riprodotto e poi
   * buttato: è un confronto fra voci, non un file da tenere. */
  const playVoicePreview = async (voiceId: string) => {
    if (!voiceId) return
    setPlayingVoiceId(voiceId)
    setVoicePreviewError('')
    try {
      const blob = await fetchVoicePreview(voiceId)
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      await audio.play()
    } catch (err) {
      setVoicePreviewError(
        err instanceof Error ? err.message : "Impossibile riprodurre l'anteprima vocale.",
      )
    } finally {
      setPlayingVoiceId(null)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    resetFormErrors()
    if (!form.profile.NOME.trim() && !form.profile.COGNOME.trim()) {
      setFormValidationError('La scheda deve contenere almeno il nome o il cognome del cliente.')
      return
    }
    if (!form.organizationId) {
      setFormValidationError("Seleziona l'organizzazione proprietaria dell'avatar.")
      return
    }

    const payload: AdminAvatarPayload = {
      category: form.category.trim() || 'Clienti',
      description: form.description.trim() || null,
      image_url: form.imageUrl.trim() || null,
      voice_id: form.voiceId.trim() || null,
      organization_id: form.organizationId,
      profile: form.profile,
    }

    try {
      if (editing === 'new') {
        const created = await createMutation.mutateAsync(payload)
        // Un avatar nuovo nasce in catalogo: se la tabella sta mostrando
        // l'archivio, torna sul catalogo così l'admin lo vede comparire.
        if (statusFilter === STATUS_ARCHIVED) setStatusFilter(STATUS_ACTIVE)
        flashSuccess(`Avatar ${created.name} creato con successo.`)
      } else if (editing) {
        const updated = await updateMutation.mutateAsync({ avatarId: editing.id, payload })
        flashSuccess(`Avatar ${updated.name} aggiornato con successo.`)
      }
      setEditing(null)
    } catch {
      // idem
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleting) return
    try {
      const result = await deleteMutation.mutateAsync(deleting.id)
      setDeleting(null)
      flashSuccess(result.message)
    } catch {
      // idem
    }
  }

  const handleRestore = async (avatar: AdminAvatar) => {
    try {
      const restored = await restoreMutation.mutateAsync(avatar.id)
      flashSuccess(`Avatar ${restored.name} ripristinato: è di nuovo in catalogo.`)
    } catch {
      // idem
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Gestione Avatar"
        description="Crea, modifica ed elimina i clienti simulati e le loro schede persona."
        actions={
          <PrimaryButton icon={<PlusIcon size={18} />} onClick={openCreate}>
            Nuovo Avatar
          </PrimaryButton>
        }
      />

      <div className="mb-8 flex flex-wrap items-end gap-4">
        <div className={fieldCls}>
          <label className={labelCls} htmlFor="avatars-org-filter">
            Organizzazione
          </label>
          <Select
            id="avatars-org-filter"
            className="min-w-[220px]"
            value={orgFilter}
            onChange={setOrgFilter}
            options={[{ value: '', label: 'Tutte le organizzazioni' }, ...orgScopeOptions]}
          />
        </div>
        <div className={fieldCls}>
          <label className={labelCls} htmlFor="avatars-status-filter">
            Stato
          </label>
          <Select
            id="avatars-status-filter"
            className="min-w-[160px]"
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS.map((o) =>
              o.value === STATUS_ARCHIVED && archivedCount
                ? { ...o, label: `${o.label} (${archivedCount})` }
                : o,
            )}
          />
        </div>
        {(orgFilter || statusFilter !== STATUS_ACTIVE) && (
          <button
            type="button"
            className="cursor-pointer rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100"
            onClick={() => {
              setOrgFilter('')
              setStatusFilter(STATUS_ACTIVE)
            }}
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

      {loadError && <FormError message={errorOf(loadError, 'Impossibile caricare gli avatar.')} />}

      {isLoading ? (
        <LoadingState message="Caricamento avatar..." />
      ) : (
        <DataTable
          columns={AVATAR_COLUMNS}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Cerca per nome, categoria o difficoltà..."
          isEmpty={visibleAvatars.length === 0}
          emptyMessage={
            statusFilter === STATUS_ARCHIVED && !search && !orgFilter
              ? 'Nessun avatar archiviato. Gli avatar che elimini finiscono qui, con tutte le loro conversazioni.'
              : search || orgFilter || statusFilter !== STATUS_ACTIVE
                ? 'Nessun avatar corrisponde ai filtri.'
                : 'Nessun avatar presente. Crea il primo con "Nuovo Avatar".'
          }
        >
          {visibleAvatars.map((a) => (
            <Tr key={a.id}>
              <Td>
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/6">
                    <img
                      className="h-full w-full object-cover"
                      src={getAvatarImageUrl(a.image_url)}
                      alt={a.name}
                    />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-slate-100">{a.name}</span>
                      {a.deleted_at && (
                        <Badge
                          tone="border border-amber-500/30 bg-amber-500/10 text-amber-400"
                          className="shrink-0"
                        >
                          Archiviato
                        </Badge>
                      )}
                    </div>
                    {a.deleted_at ? (
                      <span className="text-xs text-slate-500">
                        Archiviato il {archivedDate(a.deleted_at)}
                      </span>
                    ) : (
                      a.description && (
                        <span className="max-w-[320px] truncate text-xs text-slate-500">
                          {a.description}
                        </span>
                      )
                    )}
                  </div>
                </div>
              </Td>
              <Td>
                <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-cyan-400">
                  {a.organization_name}
                </span>
              </Td>
              <Td>
                <Badge tone={categoryBadgeClasses(a.category)}>{a.category}</Badge>
              </Td>
              <Td>
                <span className="text-[0.85rem] text-orange-400">{a.difficulty ?? '—'}</span>
              </Td>
              <Td align="center">
                <span className="inline-block min-w-8 rounded-full border border-white/6 bg-white/4 px-2 py-0.5 text-[0.8rem] font-semibold text-slate-100">
                  {a.conversation_count}
                </span>
              </Td>
              <Td>
                {/* Un avatar archiviato ha una sola azione, tornare in
                    catalogo: la sua scheda è il documento di ciò su cui gli
                    studenti si sono allenati e resta in sola lettura. */}
                <div className="flex items-center justify-end gap-2">
                  {a.deleted_at ? (
                    <Tooltip content="Ripristina avatar">
                      <button
                        className={`${actionBtnCls} hover:border-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400`}
                        onClick={() => handleRestore(a)}
                        disabled={restoreMutation.isPending && restoreMutation.variables === a.id}
                        aria-label={`Ripristina ${a.name}`}
                      >
                        {restoreMutation.isPending && restoreMutation.variables === a.id ? (
                          <Spinner variant="button" />
                        ) : (
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
                            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                            <polyline points="3 3 3 8 8 8" />
                          </svg>
                        )}
                      </button>
                    </Tooltip>
                  ) : (
                    <>
                      <Tooltip content="Modifica avatar">
                        <button
                          className={`${actionBtnCls} hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400`}
                          onClick={() => openEdit(a)}
                          aria-label={`Modifica ${a.name}`}
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
                      <Tooltip content="Elimina avatar">
                        <button
                          className={`${actionBtnCls} hover:border-red-500 hover:bg-red-500/10 hover:text-red-500`}
                          onClick={() => {
                            deleteMutation.reset()
                            setDeleting(a)
                          }}
                          aria-label={`Elimina ${a.name}`}
                        >
                          <TrashIcon />
                        </button>
                      </Tooltip>
                    </>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
        </DataTable>
      )}

      {/* Modal Crea/Modifica Avatar */}
      {editing && (
        <ModalShell onClose={() => setEditing(null)} locked={isSaving} size="sheet" padding="md">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-violet-600/20 bg-violet-600/10">
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
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <h2 className="mb-1 font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl">
              {editing === 'new' ? 'Crea Nuovo Avatar' : `Modifica ${editing.name}`}
            </h2>
            <p className="text-[0.8rem] text-slate-500">
              Scheda compilata al{' '}
              <strong className="text-slate-300">
                {Math.round((countFilled(form.profile) / ALL_PROFILE_KEYS.length) * 100)}%
              </strong>{' '}
              ({countFilled(form.profile)} campi su {ALL_PROFILE_KEYS.length})
            </p>
            <button
              type="button"
              className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-[0.8rem] font-medium text-slate-300 transition hover:bg-white/8 hover:text-slate-100"
              onClick={() => setShowPromptPreview(true)}
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
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Anteprima del prompt
            </button>
          </div>

          {formError && <FormError message={formError} />}

          {/* I campi senza cui la simulazione non regge. Un avviso, non un
                blocco: il salvataggio resta possibile perché una scheda si
                costruisce in più riprese. */}
          {missingEssentials(form.profile).length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2 text-[0.8rem] text-amber-300">
              <strong className="font-semibold">Campi chiave ancora vuoti:</strong>{' '}
              {missingEssentials(form.profile).join(', ')}. Senza questi l'avatar ha poco su cui
              reggere il personaggio.
            </div>
          )}

          <form className="flex flex-col gap-4" onSubmit={handleSave}>
            {/* ── Dati base ── */}
            <h3 className={sectionTitleCls}>Dati base</h3>
            <div className={fieldCls}>
              <label className={labelCls} htmlFor="av-description">
                Brief per l'operatore (descrizione visibile allo studente)
              </label>
              <textarea
                id="av-description"
                className={textareaCls}
                rows={2}
                placeholder="Cliente al telefono: la sua carta è stata rifiutata e chiama arrabbiato..."
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                disabled={isSaving}
              />
            </div>
            <div className={fieldCls}>
              <label className={labelCls} htmlFor="av-org">
                Organizzazione proprietaria
              </label>
              <Select
                id="av-org"
                value={form.organizationId}
                onChange={(value) => setForm((p) => ({ ...p, organizationId: value }))}
                options={orgScopeOptions}
                placeholder="Seleziona organizzazione…"
                disabled={isSaving}
              />
              <p className="text-[0.7rem] text-slate-500">
                L'avatar è privato dell'organizzazione scelta e visibile solo ai suoi utenti.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
              <div className={fieldCls}>
                <label className={labelCls} htmlFor="av-category">
                  Categoria
                </label>
                {/* Testo libero con i valori già in uso come suggerimenti:
                      una categoria nuova resta possibile, un refuso su una
                      esistente diventa improbabile. */}
                <div className={inputWrapperCls}>
                  <input
                    type="text"
                    id="av-category"
                    list="av-category-options"
                    className={inputCls}
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                    disabled={isSaving}
                  />
                </div>
                <datalist id="av-category-options">
                  {knownCategories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div className={fieldCls}>
                <label className={labelCls} htmlFor="av-voice">
                  Voce Cartesia
                </label>
                {voices.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <Select
                      id="av-voice"
                      className="flex-1"
                      value={form.voiceId}
                      onChange={(value) => setForm((p) => ({ ...p, voiceId: value }))}
                      options={voiceOptions}
                      placeholder="Voce predefinita"
                      disabled={isSaving}
                    />
                    <Tooltip content="Ascolta questa voce">
                      <button
                        type="button"
                        className={`${actionBtnCls} shrink-0 hover:border-cyan-500 hover:bg-cyan-500/10 hover:text-cyan-400`}
                        onClick={() => playVoicePreview(form.voiceId)}
                        disabled={!form.voiceId || playingVoiceId !== null || isSaving}
                        aria-label="Ascolta anteprima della voce"
                      >
                        {playingVoiceId ? (
                          <Spinner variant="button" />
                        ) : (
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
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        )}
                      </button>
                    </Tooltip>
                  </div>
                ) : (
                  /* Catalogo non disponibile: si torna all'id da incollare,
                       perché una voce mancante non deve impedire di salvare. */
                  <div className={inputWrapperCls}>
                    <input
                      type="text"
                      id="av-voice"
                      className={inputCls}
                      placeholder="es. b34ba556-..."
                      value={form.voiceId}
                      onChange={(e) => setForm((p) => ({ ...p, voiceId: e.target.value }))}
                      disabled={isSaving}
                    />
                  </div>
                )}
                {voicesError && <p className="text-[0.7rem] text-amber-400">{voicesError}</p>}
              </div>
            </div>

            <div className={fieldCls}>
              {/* Un <span>, non una <label>: il gruppo contiene due controlli
                    (il file e l'URL), nessuno dei due è "il" campo immagine. */}
              <span className={labelCls}>Immagine</span>
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/6 bg-slate-800/50">
                  {form.imageUrl ? (
                    <img
                      className="h-full w-full object-cover"
                      src={getAvatarImageUrl(form.imageUrl)}
                      alt="Anteprima immagine avatar"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[0.65rem] text-slate-600">
                      auto
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      className={`cursor-pointer rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-[0.8rem] font-medium text-slate-300 transition hover:bg-white/8 hover:text-slate-100 ${
                        uploadMutation.isPending || isSaving ? 'pointer-events-none opacity-50' : ''
                      }`}
                    >
                      {uploadMutation.isPending ? 'Caricamento...' : 'Carica immagine'}
                      <input
                        type="file"
                        className="hidden"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={uploadMutation.isPending || isSaving}
                        onChange={(e) => {
                          handleImageUpload(e.target.files?.[0])
                          // Permette di ricaricare lo stesso file dopo un errore
                          e.target.value = ''
                        }}
                      />
                    </label>
                    {form.imageUrl && (
                      <button
                        type="button"
                        className="cursor-pointer rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-[0.8rem] font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100"
                        onClick={() => setForm((p) => ({ ...p, imageUrl: '' }))}
                        disabled={isSaving}
                      >
                        Rimuovi
                      </button>
                    )}
                  </div>
                  <div className={inputWrapperCls}>
                    <input
                      type="text"
                      id="av-image"
                      className={inputCls}
                      placeholder="oppure incolla un URL"
                      value={form.imageUrl}
                      onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))}
                      disabled={isSaving}
                    />
                  </div>
                </div>
              </div>
              <p className="text-[0.7rem] text-slate-500">
                PNG, JPEG o WebP fino a 2 MB. Lasciando il campo vuoto viene generata un'immagine
                con le iniziali.
              </p>
            </div>

            {/* ── Scheda persona ──
                  Una sezione alla volta: il conteggio sull'intestazione dice
                  cosa manca senza costringere ad aprirla. */}
            <div className="mt-2 flex flex-col gap-2">
              {PROFILE_SECTIONS.map((section) => {
                const keys = section.fields.map((f) => f.key)
                const filled = countFilled(form.profile, keys)
                const isOpen = openSections.includes(section.title)
                return (
                  <div
                    key={section.title}
                    /* Niente overflow-hidden: ritaglierebbe le tendine dei
                         Select interni. Gli angoli li arrotonda direttamente
                         l'intestazione, che è l'unico figlio a sfondo pieno. */
                    className="rounded-2xl border border-white/6 bg-white/2"
                  >
                    <button
                      type="button"
                      className={`flex w-full cursor-pointer items-center justify-between gap-3 border-none bg-transparent px-4 py-3 text-left transition hover:bg-white/4 ${
                        isOpen ? 'rounded-t-2xl' : 'rounded-2xl'
                      }`}
                      onClick={() => toggleSection(section.title)}
                      aria-expanded={isOpen}
                    >
                      <span className="text-[0.72rem] font-semibold uppercase tracking-widest text-violet-400">
                        {section.title}
                      </span>
                      <span className="flex items-center gap-3">
                        <span
                          className={`text-[0.7rem] ${
                            filled === 0 ? 'text-slate-600' : 'text-slate-400'
                          }`}
                        >
                          {filled}/{keys.length}
                        </span>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`shrink-0 transition-transform ${
                            isOpen ? 'rotate-180 text-violet-400' : 'text-slate-500'
                          }`}
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="grid grid-cols-2 gap-3 border-t border-white/6 p-4 max-[600px]:grid-cols-1">
                        {section.fields.map((field) => (
                          <ProfileFieldInput
                            key={field.key}
                            field={field}
                            value={form.profile[field.key] ?? ''}
                            onChange={(value) => setProfileField(field.key, value)}
                            disabled={isSaving}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <PrimaryButton type="submit" variant="submit" className="mt-4" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Spinner variant="button" />
                  Salvataggio...
                </>
              ) : editing === 'new' ? (
                'Crea Avatar'
              ) : (
                'Salva Modifiche'
              )}
            </PrimaryButton>
          </form>
        </ModalShell>
      )}

      {/* Anteprima del prompt: legge la scheda in corso, anche non salvata */}
      {showPromptPreview && (
        <PersonaPromptPreview profile={form.profile} onClose={() => setShowPromptPreview(false)} />
      )}

      {/* Modal Conferma Eliminazione */}
      {deleting && (
        <ConfirmModal
          icon={<TrashIcon size={24} stroke="#ef4444" />}
          iconWrapperCls="border border-red-500/25 bg-red-500/10"
          title="Elimina Avatar"
          description={
            <>
              <strong className="text-slate-100">{deleting.name}</strong> esce dalla galleria degli
              studenti e non sarà più possibile iniziare nuove sessioni con lui.
              {/* L'eliminazione è logica: dirlo qui evita che sembri una
                  cancellazione di dati e che l'admin si fermi per paura. */}
              <span className="mt-3 block rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-left text-[0.8rem] text-emerald-300">
                {deleting.conversation_count > 0 ? (
                  <>
                    Le{' '}
                    <strong className="text-emerald-200">
                      {deleting.conversation_count} conversazioni
                    </strong>{' '}
                    già svolte, con le loro valutazioni, restano intatte e continuano a comparire
                    nei report.
                  </>
                ) : (
                  <>Nessun dato viene cancellato.</>
                )}{' '}
                Puoi ripristinare l'avatar in qualsiasi momento dal filtro "Archiviati".
              </span>
            </>
          }
          error={errorOf(deleteMutation.error, "Errore durante l'archiviazione.") || undefined}
          confirmLabel="Elimina Avatar"
          pendingLabel="Eliminazione..."
          confirmClassName="border-none bg-red-500 text-white hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)]"
          isPending={deleteMutation.isPending}
          onConfirm={handleConfirmDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </PageContainer>
  )
}
