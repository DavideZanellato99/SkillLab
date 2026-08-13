/* La scheda di un avatar, in creazione o in modifica.
 *
 * Le due cose sono lo stesso form: cambia solo da dove parte, vuoto o da un
 * avatar che esiste già (vedi avatarForm). Vive solo mentre è aperta, quindi
 * riaprirla riparte sempre dalla scheda giusta.
 *
 * Quattro cose possono andare storte qui dentro: la validazione, il
 * caricamento dell'immagine, il salvataggio e l'anteprima vocale. Il banner
 * è uno solo e mostra la prima che è successa. */

import { useState } from 'react'

import {
  useCreateAvatar,
  useUpdateAvatar,
  useUploadAvatarImage,
  useVoices,
} from '../hooks/useAdminAvatars'
import { useAvatarCategories } from '../hooks/useAvatarCategories'
import { getAvatarImageUrl } from '../services/api'
import type { AdminAvatar } from '../services/admin'
import { fetchVoicePreview } from '../services/admin'
import type { AvatarFormState } from './avatarForm'
import {
  applyDraft,
  avatarFormError,
  avatarFormFrom,
  avatarPayload,
  emptyAvatarForm,
} from './avatarForm'
import { ALL_PROFILE_KEYS, countFilled, missingEssentials } from './avatarProfileConfig'
import AvatarProfileSections from './AvatarProfileSections'
import PersonaDraftModal from './PersonaDraftModal'
import { fieldCls, inputCls, inputWrapperCls, labelCls, textareaCls } from './Field'
import FormError from './FormError'
import IconButton from './IconButton'
import ModalShell from './ModalShell'
import PersonaPromptPreview from './PersonaPromptPreview'
import PrimaryButton from './PrimaryButton'
import Select from './Select'
import Spinner from './Spinner'

const sectionTitleCls =
  'mb-3 mt-2 border-b border-white/6 pb-2 text-[0.72rem] font-semibold uppercase tracking-widest text-violet-400'

interface AvatarFormModalProps {
  /** L'avatar da modificare, oppure 'new' per crearne uno. */
  target: AdminAvatar | 'new'
  organizationOptions: { value: string; label: string }[]
  onClose: () => void
  onSaved: (message: string) => void
  /** Apre l'anagrafica delle categorie sopra questa scheda. */
  onManageCategories: (organizationId: string) => void
}

export default function AvatarFormModal({
  target,
  organizationOptions,
  onClose,
  onSaved,
  onManageCategories,
}: AvatarFormModalProps) {
  const isNew = target === 'new'

  const [form, setForm] = useState<AvatarFormState>(() =>
    isNew ? emptyAvatarForm() : avatarFormFrom(target),
  )
  const [validationError, setValidationError] = useState('')
  const [voicePreviewError, setVoicePreviewError] = useState('')
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const [showPromptPreview, setShowPromptPreview] = useState(false)
  const [showDraft, setShowDraft] = useState(false)
  /* Quali campi vengono dalla bozza e non dalle mani di chi compila: è la
   * memoria che permette di rigenerare senza portare via le correzioni (vedi
   * applyDraft). Vive qui e non nel form salvato perché riguarda questa
   * sessione di compilazione e nient'altro: riaprire la scheda di un avatar
   * salvato la azzera, ed è giusto, perché a quel punto ogni campo è roba
   * che qualcuno ha deciso di tenere. */
  const [draftedKeys, setDraftedKeys] = useState<string[]>([])
  const [draftNotice, setDraftNotice] = useState('')

  const createMutation = useCreateAvatar()
  const updateMutation = useUpdateAvatar()
  const uploadMutation = useUploadAvatarImage()

  /* Il catalogo voci si carica all'apertura della scheda, così chi non tocca
   * mai gli avatar non paga una chiamata al fornitore. Se non risponde, il
   * campo torna a essere un id da incollare a mano invece di bloccare il
   * salvataggio. */
  const { data: voices = [], error: voicesQueryError } = useVoices(true)
  const voicesError = voicesQueryError ? 'Catalogo voci non disponibile.' : ''

  /* Le categorie fra cui scegliere sono quelle dell'organizzazione scelta per
   * l'avatar, e nessun'altra: una categoria di un altro tenant sposterebbe
   * l'avatar di organizzazione, e il server la rifiuta. Finché
   * l'organizzazione non è scelta non c'è niente da chiedere al server. */
  const { data: categories = [] } = useAvatarCategories(
    form.organizationId,
    Boolean(form.organizationId),
  )
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))

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

  const isSaving = createMutation.isPending || updateMutation.isPending
  const errorOf = (error: unknown, fallback: string) =>
    error ? (error instanceof Error ? error.message : fallback) : ''
  const formError =
    validationError ||
    errorOf(uploadMutation.error, "Errore durante il caricamento dell'immagine.") ||
    errorOf(createMutation.error ?? updateMutation.error, 'Errore durante il salvataggio.') ||
    voicePreviewError

  /** Ripulisce i messaggi che il form può aver lasciato dietro di sé. */
  const resetErrors = () => {
    setValidationError('')
    setVoicePreviewError('')
    uploadMutation.reset()
    createMutation.reset()
    updateMutation.reset()
  }

  /* Toccare un campo lo fa diventare tuo: esce dall'elenco di quelli che
   * vengono dalla bozza, e da lì in poi una rigenerazione non lo tocca più.
   * È la metà della regola che protegge le correzioni; l'altra metà, quella
   * che permette di rigenerare, sta in applyDraft. */
  const setProfileField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, profile: { ...prev.profile, [key]: value } }))
    setDraftedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : prev))
  }

  const handleDrafted = (profile: Record<string, string>) => {
    const merge = applyDraft(form.profile, profile, draftedKeys)
    setForm((prev) => ({ ...prev, profile: merge.profile }))
    setDraftedKeys(merge.draftedKeys)
    setShowDraft(false)
    setDraftNotice(
      merge.kept > 0
        ? `Bozza inserita in ${merge.written} campi. ${merge.kept} li avevi già scritti tu e sono rimasti come stanno.`
        : `Bozza inserita in ${merge.written} campi. Rileggila prima di salvare: è una proposta, non una scheda finita.`,
    )
  }

  const handleImageUpload = async (file: File | undefined) => {
    if (!file) return
    resetErrors()
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    resetErrors()

    const problem = avatarFormError(form)
    if (problem) {
      setValidationError(problem)
      return
    }

    try {
      if (isNew) {
        const created = await createMutation.mutateAsync(avatarPayload(form))
        onSaved(`Avatar ${created.name} creato con successo.`)
      } else {
        const updated = await updateMutation.mutateAsync({
          avatarId: target.id,
          payload: avatarPayload(form),
        })
        onSaved(`Avatar ${updated.name} aggiornato con successo.`)
      }
    } catch {
      // idem
    }
  }

  const filledCount = countFilled(form.profile)
  const missing = missingEssentials(form.profile)

  return (
    <ModalShell onClose={onClose} locked={isSaving} size="sheet" padding="md">
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
          {isNew ? 'Crea Nuovo Avatar' : `Modifica ${target.name}`}
        </h2>
        <p className="text-[0.8rem] text-slate-500">
          Scheda compilata al{' '}
          <strong className="text-slate-300">
            {Math.round((filledCount / ALL_PROFILE_KEYS.length) * 100)}%
          </strong>{' '}
          ({filledCount} campi su {ALL_PROFILE_KEYS.length})
        </p>
        {/* Le due cose che si fanno a una scheda senza uscire da qui: farsela
            scrivere, e leggere cosa ne esce. Nell'ordine in cui capitano. */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-violet-600/30 bg-violet-600/10 px-4 py-2 text-[0.8rem] font-medium text-violet-300 transition hover:bg-violet-600/20 hover:text-violet-200"
            onClick={() => setShowDraft(true)}
            disabled={isSaving}
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
              <path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z" />
              <path d="M19 15.5 19.8 17.4 21.7 18.2 19.8 19 19 20.9 18.2 19 16.3 18.2 18.2 17.4 19 15.5Z" />
            </svg>
            Genera la scheda
          </button>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-[0.8rem] font-medium text-slate-300 transition hover:bg-white/8 hover:text-slate-100"
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
      </div>

      {formError && <FormError message={formError} />}

      {/* Non è un successo, è un avviso: la scheda adesso è piena di roba che
          non ha scritto nessuno, e va riletta prima di salvare. */}
      {draftNotice && (
        <div className="mb-4 rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-2 text-[0.8rem] text-violet-200">
          {draftNotice}
        </div>
      )}

      {/* I campi senza cui la simulazione non regge. Un avviso, non un
          blocco: il salvataggio resta possibile perché una scheda si
          costruisce in più riprese. */}
      {missing.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2 text-[0.8rem] text-amber-300">
          <strong className="font-semibold">Campi chiave ancora vuoti:</strong> {missing.join(', ')}
          . Senza questi elementi l'avatar dispone di poche informazioni per sostenere il
          personaggio.
        </div>
      )}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <h3 className={sectionTitleCls}>Dati base</h3>
        <div className={fieldCls}>
          <label className={labelCls} htmlFor="av-description">
            Brief per l'operatore (descrizione visibile allo studente)
          </label>
          <textarea
            id="av-description"
            className={textareaCls}
            rows={2}
            placeholder="Es. Cliente al telefono: la carta è stata rifiutata e chiama in stato di irritazione..."
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
            onChange={(value) =>
              /* La categoria si azzera insieme all'organizzazione: quella
               * scelta prima è di un altro tenant, e tenerla ferma nel campo
               * darebbe un rifiuto al salvataggio senza far capire da dove
               * arriva. */
              setForm((p) => ({ ...p, organizationId: value, categoryId: '' }))
            }
            options={organizationOptions}
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
            {/* Un elenco chiuso, non più testo libero: le categorie sono
                un'anagrafica dell'organizzazione, e da qui si arriva a
                gestirla senza chiudere la scheda a metà. */}
            <Select
              id="av-category"
              value={form.categoryId}
              onChange={(value) => setForm((p) => ({ ...p, categoryId: value }))}
              options={categoryOptions}
              placeholder={
                form.organizationId ? 'Seleziona categoria…' : 'Scegli prima l’organizzazione'
              }
              disabled={isSaving || !form.organizationId}
            />
            <button
              type="button"
              className="w-fit cursor-pointer border-none bg-transparent p-0 text-[0.7rem] text-violet-400 underline-offset-2 transition hover:underline"
              onClick={() => onManageCategories(form.organizationId)}
              disabled={isSaving}
            >
              Gestisci categorie
            </button>
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
                <IconButton
                  tone="play"
                  className="shrink-0"
                  label="Ascolta anteprima della voce"
                  tooltip="Ascolta questa voce"
                  onClick={() => playVoicePreview(form.voiceId)}
                  disabled={!form.voiceId || playingVoiceId !== null || isSaving}
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
                </IconButton>
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
                  placeholder="oppure inserisci un URL"
                  value={form.imageUrl}
                  onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))}
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>
          <p className="text-[0.7rem] text-slate-500">
            PNG, JPEG o WebP fino a 2 MB. Lasciando il campo vuoto viene generata un'immagine con le
            iniziali.
          </p>
        </div>

        <AvatarProfileSections
          profile={form.profile}
          onFieldChange={setProfileField}
          disabled={isSaving}
        />

        <PrimaryButton type="submit" variant="submit" className="mt-4" disabled={isSaving}>
          {isSaving ? (
            <>
              <Spinner variant="button" />
              Salvataggio...
            </>
          ) : isNew ? (
            'Crea Avatar'
          ) : (
            'Salva Modifiche'
          )}
        </PrimaryButton>
      </form>

      {/* Anteprima del prompt: legge la scheda in corso, anche non salvata */}
      {showPromptPreview && (
        <PersonaPromptPreview profile={form.profile} onClose={() => setShowPromptPreview(false)} />
      )}

      {/* La bozza si apre sopra la scheda, e la scheda resta lì dietro: è
          quello che sta per essere riempito. */}
      {showDraft && (
        <PersonaDraftModal
          difficulty={form.profile.GRADO_DIFFICOLTA ?? ''}
          onClose={() => setShowDraft(false)}
          onDrafted={handleDrafted}
        />
      )}
    </ModalShell>
  )
}
