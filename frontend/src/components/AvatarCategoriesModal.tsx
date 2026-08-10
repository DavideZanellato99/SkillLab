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
import ModalShell, { ModalHeader } from './ModalShell'
import Select from './Select'
import Badge from './Badge'
import FormError from './FormError'
import LoadingState from './LoadingState'
import PrimaryButton from './PrimaryButton'
import CategoryColorPicker from './CategoryColorPicker'
import { categoryBadgeClasses } from './categoryStyles'
import { TrashIcon, PencilIcon, PlusIcon } from './icons'
import Tooltip from './Tooltip'
import { fieldCls, labelCls, inputWrapperCls, inputCls } from './Field'
import { iconActionCls as actionBtnCls } from './IconButton'

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
  const [form, setForm] = useState<FormState>(emptyForm())
  const [validationError, setValidationError] = useState('')

  const isSaving = createMutation.isPending || updateMutation.isPending
  const isBusy = isSaving || deleteMutation.isPending

  const errorOf = (error: unknown, fallback: string) =>
    error ? (error instanceof Error ? error.message : fallback) : ''

  /* Il banner è uno solo, quindi mostra il primo problema: quello del form,
   * poi quello dell'ultima scrittura. Il rifiuto di una cancellazione (la
   * categoria è ancora in uso) arriva da qui. */
  const error =
    validationError ||
    errorOf(createMutation.error ?? updateMutation.error, 'Errore durante il salvataggio.') ||
    errorOf(deleteMutation.error, "Errore durante l'eliminazione.")

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

  const handleDelete = async (category: AdminAvatarCategory) => {
    resetErrors()
    try {
      await deleteMutation.mutateAsync(category.id)
      if (editing?.id === category.id) startCreate()
    } catch {
      // idem: un 409 significa che la categoria è ancora addosso a qualcuno
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
        title="Categorie avatar"
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
              <Tooltip content="Modifica">
                <button
                  type="button"
                  className={`${actionBtnCls} hover:border-violet-600 hover:bg-violet-600/10 hover:text-violet-400`}
                  onClick={() => startEdit(c)}
                  disabled={isBusy}
                  aria-label={`Modifica ${c.name}`}
                >
                  <PencilIcon size={14} />
                </button>
              </Tooltip>
              <Tooltip
                content={
                  c.avatar_count
                    ? 'Sposta prima gli avatar in un’altra categoria'
                    : 'Elimina la categoria'
                }
              >
                {/* Il bottone resta attivo anche con avatar attaccati: il
                    rifiuto arriva dal server e spiega cosa fare, che è più
                    onesto di un bottone spento senza spiegazione. */}
                <button
                  type="button"
                  className={`${actionBtnCls} hover:border-red-500 hover:bg-red-500/10 hover:text-red-400`}
                  onClick={() => handleDelete(c)}
                  disabled={isBusy}
                  aria-label={`Elimina ${c.name}`}
                >
                  <TrashIcon size={14} />
                </button>
              </Tooltip>
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
            <button
              type="button"
              className="cursor-pointer rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100"
              onClick={startCreate}
              disabled={isBusy}
            >
              Annulla
            </button>
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
    </ModalShell>
  )
}
