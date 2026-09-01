/* L'anagrafica delle categorie di un'organizzazione, da dentro la pagina
 * degli avatar.
 *
 * Sta qui e non in una pagina sua perché le categorie non hanno vita propria:
 * esistono per raggruppare gli avatar, sono poche righe, e si toccano mentre
 * si sta lavorando su un avatar. Il modale sa stare anche sopra il form
 * dell'avatar (`elevated`), così una categoria che manca si crea senza
 * chiudere la scheda a metà.
 *
 * Le categorie sono di un'organizzazione sola: il selettore in cima dice di
 * quale si stanno guardando, ed è la stessa scelta che il form dell'avatar fa
 * per l'avatar. */

import { useState } from 'react'
import type { AdminAvatarCategory } from '../services/admin'
import {
  useAvatarCategories,
  useCreateAvatarCategory,
  useUpdateAvatarCategory,
  useDeleteAvatarCategory,
} from '../hooks/useAvatarCategories'
import { useOrganizations } from '../hooks/useOrganizations'
import { errorMessage } from '../services/errors'
import ModalShell, { ModalHeader } from './ModalShell'
import Select from './Select'
import Badge from './Badge'
import FormError from './FormError'
import LoadingState from './LoadingState'
import PrimaryButton from './PrimaryButton'
import SecondaryButton from './SecondaryButton'
import CategoryColorPicker from './CategoryColorPicker'
import ConfirmModal from './ConfirmModal'
import { categoryBadgeClasses } from './categoryStyles'
import { TrashIcon, PencilIcon, PlusIcon } from './icons'
import { fieldCls, labelCls, inputWrapperCls, inputCls } from './Field'
import IconButton from './IconButton'

const DEFAULT_COLOR = 'violet'

interface AvatarCategoriesModalProps {
  /** L'organizzazione da cui partire, se la pagina ne ha una in mano. */
  organizationId?: string
  onClose: () => void
  /** Sopra il form dell'avatar, quando si apre da lì. */
  elevated?: boolean
}

interface FormState {
  name: string
  color: string
}

const emptyForm = (): FormState => ({ name: '', color: DEFAULT_COLOR })

export default function AvatarCategoriesModal({
  organizationId,
  onClose,
  elevated = false,
}: AvatarCategoriesModalProps) {
  const { data: organizations = [] } = useOrganizations()
  const [orgId, setOrgId] = useState(organizationId ?? '')
  /* Con una sola organizzazione la scelta non è una scelta: il selettore
   * resta, ma parte già su quella invece di chiedere l'ovvio. */
  const selectedOrgId = orgId || (organizations.length === 1 ? organizations[0].id : '')

  const { data: categories = [], isLoading } = useAvatarCategories(
    selectedOrgId,
    Boolean(selectedOrgId),
  )

  const createMutation = useCreateAvatarCategory()
  const updateMutation = useUpdateAvatarCategory()
  const deleteMutation = useDeleteAvatarCategory()

  /** Quale riga si sta modificando; null significa "ne sto creando una". */
  const [editing, setEditing] = useState<AdminAvatarCategory | null>(null)
  /** Quale riga sta aspettando una conferma prima di sparire. */
  const [deleting, setDeleting] = useState<AdminAvatarCategory | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [validationError, setValidationError] = useState('')

  const isSaving = createMutation.isPending || updateMutation.isPending
  const isBusy = isSaving || deleteMutation.isPending

  /* Il banner è uno solo, quindi mostra il primo problema: quello del form e
   * poi quello dell'ultimo salvataggio. Il rifiuto di una cancellazione non
   * passa di qui: sta nella conferma da cui è partita, dove chi ha premuto
   * sta ancora guardando. */
  const error =
    validationError ||
    errorMessage(createMutation.error ?? updateMutation.error, 'Errore durante il salvataggio.')

  const resetErrors = () => {
    setValidationError('')
    createMutation.reset()
    updateMutation.reset()
    deleteMutation.reset()
  }

  const startCreate = () => {
    resetErrors()
    setEditing(null)
    setForm(emptyForm())
  }

  const startEdit = (category: AdminAvatarCategory) => {
    resetErrors()
    setEditing(category)
    setForm({ name: category.name, color: category.color })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    resetErrors()
    if (!selectedOrgId) {
      setValidationError("Seleziona l'organizzazione a cui appartiene la categoria.")
      return
    }
    if (!form.name.trim()) {
      setValidationError('Il nome della categoria è obbligatorio.')
      return
    }

    const payload = { name: form.name.trim(), color: form.color }

    try {
      if (editing) {
        await updateMutation.mutateAsync({ categoryId: editing.id, payload })
      } else {
        await createMutation.mutateAsync({ ...payload, organization_id: selectedOrgId })
      }
      startCreate()
    } catch {
      // Il messaggio è nella mutation, il banner qui sopra lo mostra
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await deleteMutation.mutateAsync(deleting.id)
      if (editing?.id === deleting.id) startCreate()
      setDeleting(null)
    } catch {
      // Un 409 significa che la categoria è ancora addosso a qualcuno: la
      // conferma resta aperta a dirlo
    }
  }

  return (
    <ModalShell onClose={onClose} locked={isBusy} size="md" padding="md" elevated={elevated}>
      <ModalHeader
        icon={
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-violet-400"
          >
            <path d="M7 7h.01M3 5v4.5a2 2 0 0 0 .6 1.4l8 8a2 2 0 0 0 2.8 0l5.5-5.5a2 2 0 0 0 0-2.8l-8-8A2 2 0 0 0 10.5 3H5a2 2 0 0 0-2 2Z" />
          </svg>
        }
        iconWrapperCls="border border-violet-600/25 bg-violet-600/10"
        title="Categorie Avatar"
        description="Ogni organizzazione ha le proprie categorie: qui si creano, si rinominano e si personalizzano nel colore."
      />

      <div className={`${fieldCls} mb-6`}>
        <label className={labelCls} htmlFor="cat-org">
          Organizzazione
        </label>
        <Select
          id="cat-org"
          value={selectedOrgId}
          onChange={(value) => {
            setOrgId(value)
            startCreate()
          }}
          options={organizations.map((o) => ({ value: o.id, label: o.name }))}
          placeholder="Seleziona organizzazione…"
          disabled={isBusy}
        />
      </div>

      {error && <FormError message={error} />}

      {!selectedOrgId ? (
        <p className="mb-6 text-[0.85rem] text-slate-500">
          Seleziona un'organizzazione per visualizzarne le categorie
        </p>
      ) : isLoading ? (
        <LoadingState message="Caricamento categorie..." />
      ) : categories.length === 0 ? (
        <p className="mb-6 text-[0.85rem] text-slate-500">
          Nessuna categoria in questa organizzazione
        </p>
      ) : (
        <ul className="mb-6 flex flex-col gap-1.5">
          {categories.map((c) => (
            <li
              key={c.id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition ${
                editing?.id === c.id
                  ? 'border-violet-600/50 bg-violet-600/8'
                  : 'border-white/6 bg-white/4'
              }`}
            >
              <Badge tone={categoryBadgeClasses(c.color)}>{c.name}</Badge>
              <span className="ml-auto shrink-0 text-[0.75rem] text-slate-500">
                {c.avatar_count === 1 ? '1 avatar' : `${c.avatar_count} avatar`}
              </span>
              <IconButton
                label={`Modifica ${c.name}`}
                tooltip="Modifica categoria"
                onClick={() => startEdit(c)}
                disabled={isBusy}
              >
                <PencilIcon />
              </IconButton>
              {/* Il bottone resta attivo anche con avatar attaccati: dire
                  perché non si può fare è compito della conferma, che lo
                  scrive, mentre un bottone spento non spiegherebbe niente. */}
              <IconButton
                tone="danger"
                label={`Elimina ${c.name}`}
                tooltip="Elimina categoria"
                onClick={() => {
                  deleteMutation.reset()
                  setDeleting(c)
                }}
                disabled={isBusy}
              >
                <TrashIcon />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <form className="flex flex-col gap-4 border-t border-white/6 pt-6" onSubmit={handleSubmit}>
        <h3 className="text-[0.72rem] font-semibold uppercase tracking-widest text-violet-400">
          {editing ? `Modifica ${editing.name}` : 'Nuova categoria'}
        </h3>
        <div className={fieldCls}>
          <label className={labelCls} htmlFor="cat-name">
            Nome
          </label>
          <div className={inputWrapperCls}>
            <input
              type="text"
              id="cat-name"
              className={inputCls}
              placeholder="Clienti"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              disabled={isBusy || !selectedOrgId}
            />
          </div>
        </div>
        <div className={fieldCls}>
          <span className={labelCls}>Colore</span>
          <CategoryColorPicker
            value={form.color}
            onChange={(color) => setForm((p) => ({ ...p, color }))}
            disabled={isBusy || !selectedOrgId}
          />
        </div>
        <div className="flex justify-end gap-2">
          {editing && (
            <SecondaryButton onClick={startCreate} disabled={isBusy}>
              Annulla
            </SecondaryButton>
          )}
          <PrimaryButton
            type="submit"
            icon={editing ? undefined : <PlusIcon size={16} />}
            disabled={isBusy || !selectedOrgId}
          >
            {editing ? 'Salva' : 'Aggiungi'}
          </PrimaryButton>
        </div>
      </form>

      {/* Qui la cancellazione è vera, non l'archiviazione di un avatar: la
          riga sparisce e non torna. È l'unica eliminazione della sezione che
          non passava da una conferma, e bastava un dito fuori posto.

          Con degli avatar attaccati la conferma lo dice, ma non si spegne:
          a decidere resta il server, che conta gli avatar nel momento in cui
          la richiesta arriva. Il numero qui è quello dell'ultima lettura, e
          spegnere il bottone su un numero vecchio vorrebbe dire impedire di
          eliminare una categoria che nel frattempo si è svuotata. */}
      {deleting && (
        <ConfirmModal
          elevated
          icon={<TrashIcon size={24} stroke="#ef4444" />}
          iconWrapperCls="border border-red-500/25 bg-red-500/10"
          title="Elimina Categoria"
          description={
            deleting.avatar_count > 0 ? (
              <>
                <strong className="text-slate-100">{deleting.name}</strong> risulta usata da{' '}
                {deleting.avatar_count === 1 ? '1 avatar' : `${deleting.avatar_count} avatar`},
                archiviati compresi. Finché sono lì l'eliminazione viene rifiutata: spostali in
                un'altra categoria, perché un avatar senza categoria non può esistere.
              </>
            ) : (
              <>
                <strong className="text-slate-100">{deleting.name}</strong> viene eliminata
                definitivamente. Non la usa nessun avatar, quindi non si perde nient'altro.
              </>
            )
          }
          error={errorMessage(deleteMutation.error, "Errore durante l'eliminazione.") || undefined}
          confirmLabel="Elimina Categoria"
          pendingLabel="Eliminazione..."
          confirmClassName="border-none bg-red-500 text-white hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)]"
          isPending={deleteMutation.isPending}
          onConfirm={handleDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </ModalShell>
  )
}
