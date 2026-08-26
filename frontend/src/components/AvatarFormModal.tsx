/* La scheda di un avatar, in creazione o in modifica.
 *
 * Le due cose sono lo stesso form: cambia solo da dove parte, vuoto o da un
 * avatar che esiste già (vedi avatarForm). Vive solo mentre è aperta, quindi
 * riaprirla riparte sempre dalla scheda giusta.
 *
 * Quattro cose possono andare storte qui dentro: la validazione, il
 * caricamento dell'immagine, il salvataggio e l'anteprima vocale. Il banner
 * è uno solo e mostra la prima che è successa.
 *
 * Chiudere non è mai un gesto a perdere: finché la scheda è diversa da come
 * si è aperta, la X, Esc e il clic sullo sfondo passano da una conferma (vedi
 * `avatarFormChanged`), e il browser ne chiede un'altra sua per il
 * ricaricamento e la chiusura della scheda. */

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  useCreateAvatar,
  useUpdateAvatar,
  useUploadAvatarImage,
  useVoices,
} from '../hooks/useAdminAvatars'
import { useAvatarCategories } from '../hooks/useAvatarCategories'
import { useLeaveConfirmation } from '../hooks/useLeaveConfirmation'
import { getAvatarImageUrl } from '../services/api'
import type { AdminAvatar } from '../services/admin'
import { fetchVoicePreview } from '../services/admin'
import { errorMessage } from '../services/errors'
import type { AvatarFormState } from './avatarForm'
import {
  applyDraft,
  avatarFormChanged,
  avatarFormError,
  avatarFormFrom,
  avatarPayload,
  emptyAvatarForm,
  isExternalImageUrl,
} from './avatarForm'
import { ALL_PROFILE_KEYS, countFilled, missingEssentials } from './avatarProfileConfig'
import AvatarProfileSections from './AvatarProfileSections'
import ConfirmModal from './ConfirmModal'
import PersonaDraftModal from './PersonaDraftModal'
import { fieldCls, inputCls, inputWrapperCls, labelCls, textareaCls } from './Field'
import FormError from './FormError'
import IconButton from './IconButton'
import ModalShell from './ModalShell'
import PersonaPromptPreview from './PersonaPromptPreview'
import PrimaryButton from './PrimaryButton'
import Select from './Select'
import Spinner from './Spinner'
import { EyeIcon, InfoIcon, PlayIcon, SparkleIcon, StopIcon } from './icons'

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
  /* A che punto è l'ascolto di una voce: la battuta va chiesta al fornitore
   * (`loading`) e poi dura qualche secondo (`playing`). Sono due momenti
   * diversi anche per chi guarda, una rotella e un quadrato da premere per
   * fermare, quindi sono due stati e non un booleano. */
  const [voicePreview, setVoicePreview] = useState<'idle' | 'loading' | 'playing'>('idle')
  const [showPromptPreview, setShowPromptPreview] = useState(false)
  const [showDraft, setShowDraft] = useState(false)
  /* Quante bozze sono entrate nella scheda: alla fisarmonica basta che il
   * numero cambi per aprirsi tutta, così quello che ha scritto il modello si
   * rilegge invece di restare dietro otto pannelli chiusi. */
  const [draftCount, setDraftCount] = useState(0)
  const [confirmingClose, setConfirmingClose] = useState(false)
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
    { value: '', label: 'Voce Predefinita' },
    ...voices.map((v) => ({ value: v.id, label: v.name })),
    ...(form.voiceId && !voices.some((v) => v.id === form.voiceId)
      ? [{ value: form.voiceId, label: `${form.voiceId} (non nel catalogo)` }]
      : []),
  ]

  const isSaving = createMutation.isPending || updateMutation.isPending

  /* La scheda com'era all'apertura, per sapere se c'è qualcosa da perdere.
     Un ref e non uno stato: è il termine di paragone, non cambia mai, e non
     deve far ridisegnare niente quando lo si legge. */
  const openedWith = useRef(form)
  const isDirty = avatarFormChanged(form, openedWith.current)

  // Il ricaricamento e la chiusura della scheda del browser, che non passano
  // di qui: l'avviso lo scrive il browser, con parole sue.
  useLeaveConfirmation(isDirty)

  /* Ogni strada per chiudere passa da qui: la X, Esc, il clic sullo sfondo.
     Con la scheda toccata si ferma su una conferma, perché quello che si
     perderebbe sono fino a settanta campi, e a volte una bozza appena
     generata. */
  const requestClose = () => {
    if (isDirty) setConfirmingClose(true)
    else onClose()
  }

  const formError =
    validationError ||
    errorMessage(uploadMutation.error, "Errore durante il caricamento dell'immagine.") ||
    errorMessage(createMutation.error ?? updateMutation.error, 'Errore durante il salvataggio.') ||
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
    setDraftCount((n) => n + 1)
    setDraftNotice(
      merge.kept > 0
        ? `Bozza inserita in ${merge.written} campi. ${merge.kept} erano già compilati e sono rimasti invariati.`
        : `Bozza inserita in ${merge.written} campi. Rileggila prima di salvare: è una proposta, non una scheda definitiva.`,
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

  /* La battuta che si sta ascoltando. Sta in un ref perché non si disegna:
     quello che si vede è `voicePreview`. Serve a fermarla e a non lasciarne
     due addosso. */
  const audioRef = useRef<HTMLAudioElement | null>(null)

  /** Ferma l'ascolto e libera l'oggetto che lo teneva in memoria. */
  const stopVoicePreview = useCallback(() => {
    const audio = audioRef.current
    audioRef.current = null
    setVoicePreview('idle')
    if (!audio) return
    audio.pause()
    URL.revokeObjectURL(audio.src)
  }, [])

  // La scheda si chiude mentre una voce parla: l'audio non le sopravvive.
  useEffect(() => stopVoicePreview, [stopVoicePreview])

  /* Ascolta una voce prima di assegnarla. L'audio viene riprodotto e poi
   * buttato: è un confronto fra voci, non un file da tenere.
   *
   * Lo stato resta acceso fino alla fine della battuta e non fino a quando
   * parte. `play()` mantiene la promessa appena il suono comincia, quindi
   * spegnere lì dava una rotella che lampeggiava per un istante, il bottone
   * di nuovo premibile con la voce ancora in corso, e due anteprime
   * sovrapposte al secondo clic. Da qui anche la possibilità di fermare:
   * un'anteprima che è partita per sbaglio deve poter tacere. */
  const playVoicePreview = async (voiceId: string) => {
    if (!voiceId) return
    setVoicePreview('loading')
    setVoicePreviewError('')
    let url = ''
    try {
      const blob = await fetchVoicePreview(voiceId)
      url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = stopVoicePreview
      audio.onerror = stopVoicePreview
      await audio.play()
      setVoicePreview('playing')
    } catch (err) {
      if (url) URL.revokeObjectURL(url)
      audioRef.current = null
      setVoicePreview('idle')
      setVoicePreviewError(
        err instanceof Error ? err.message : "Impossibile riprodurre l'anteprima vocale.",
      )
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
  const hasExternalImage = isExternalImageUrl(form.imageUrl)

  return (
    <ModalShell
      onClose={requestClose}
      locked={isSaving}
      size="sheet"
      padding="md"
      label={isNew ? 'Crea Nuovo Avatar' : `Modifica ${target.name}`}
    >
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
            <SparkleIcon />
            Genera la Scheda
          </button>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-[0.8rem] font-medium text-slate-300 transition hover:bg-white/8 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => setShowPromptPreview(true)}
            disabled={isSaving}
          >
            <EyeIcon />
            Anteprima del Prompt
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
        <h3 className={sectionTitleCls}>Dati Base</h3>
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
              Gestisci Categorie
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
                  placeholder="Voce Predefinita"
                  disabled={isSaving}
                />
                {/* Lo stesso bottone avvia e ferma: una battuta dura qualche
                    secondo, e chi l'ha fatta partire per sbaglio deve poterla
                    zittire senza aspettare che finisca. */}
                <IconButton
                  tone="play"
                  className="shrink-0"
                  label={
                    voicePreview === 'playing'
                      ? 'Interrompi Anteprima della Voce'
                      : 'Ascolta Anteprima della Voce'
                  }
                  tooltip={
                    voicePreview === 'playing' ? "Interrompi l'ascolto" : 'Ascolta questa voce'
                  }
                  onClick={() =>
                    voicePreview === 'playing' ? stopVoicePreview() : playVoicePreview(form.voiceId)
                  }
                  disabled={!form.voiceId || voicePreview === 'loading' || isSaving}
                >
                  {voicePreview === 'loading' ? (
                    <Spinner variant="button" />
                  ) : voicePreview === 'playing' ? (
                    <StopIcon />
                  ) : (
                    <PlayIcon />
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
              {/* Un percorso di qui, non un indirizzo altrove: il campo
                  invitava a incollare un URL e poi il salvataggio lo
                  rifiutava, a scheda già compilata. Adesso lo dice il
                  segnaposto, e l'avviso arriva mentre si scrive. */}
              <div className={inputWrapperCls}>
                <input
                  type="text"
                  id="av-image"
                  className={inputCls}
                  placeholder="oppure il percorso di un'immagine già caricata"
                  value={form.imageUrl}
                  onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))}
                  disabled={isSaving}
                  aria-invalid={hasExternalImage}
                />
              </div>
            </div>
          </div>
          {hasExternalImage ? (
            <p className="text-[0.7rem] text-amber-400">
              Il ritratto deve stare sull'applicazione: carica il file invece di incollare
              l'indirizzo di un altro sito.
            </p>
          ) : (
            <p className="text-[0.7rem] text-slate-500">
              PNG, JPEG o WebP fino a 2 MB. Lasciando il campo vuoto viene generata un'immagine con
              le iniziali.
            </p>
          )}
        </div>

        <AvatarProfileSections
          profile={form.profile}
          onFieldChange={setProfileField}
          disabled={isSaving}
          expandSignal={draftCount}
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
        <PersonaDraftModal onClose={() => setShowDraft(false)} onDrafted={handleDrafted} />
      )}

      {/* Non è una conferma di cortesia: qui dietro ci sono fino a settanta
          campi, e la bozza che ne ha riempita una parte è costata una
          chiamata a un modello. Chiudere per sbaglio li porta via tutti. */}
      {confirmingClose && (
        <ConfirmModal
          elevated
          icon={<InfoIcon size={24} stroke="#fbbf24" />}
          iconWrapperCls="border border-amber-500/25 bg-amber-500/10"
          title="Chiudi senza Salvare"
          description={
            isNew
              ? "L'avatar non è ancora stato creato: chiudendo, quello che è stato compilato non resta da nessuna parte."
              : `Le modifiche alla scheda di ${target.name} non sono state salvate e verranno perse.`
          }
          confirmLabel="Chiudi senza Salvare"
          pendingLabel="Chiusura..."
          confirmClassName="border-none bg-red-500 text-white hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)]"
          isPending={false}
          onConfirm={onClose}
          onClose={() => setConfirmingClose(false)}
        />
      )}
    </ModalShell>
  )
}
