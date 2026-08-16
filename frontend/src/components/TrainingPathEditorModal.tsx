import { useMemo, useState } from 'react'
import { useAssignableContent, useCreatePath, useUpdatePath } from '../hooks/useTraining'
import type { TrainingPath } from '../services/training'
import Field, { formInputCls, textareaCls } from './Field'
import FormError from './FormError'
import LoadingState from './LoadingState'
import ModalShell, { ModalHeader } from './ModalShell'
import PathDraftPanel from './PathDraftPanel'
import PathStepEditor, { PathStepsHeader } from './PathStepEditor'
import PrimaryButton from './PrimaryButton'
import Select from './Select'
import Spinner from './Spinner'
import { PlusIcon } from './icons'
import { moved } from './listOrder'
import type { PathStepDraft } from './pathStepDraft'
import {
  draftFromProposal,
  draftFromStep,
  emptyDraft,
  isDraftComplete,
  toStepInput,
} from './pathStepDraft'
import type { TrainingPathDraft } from '../services/training'

/* Comporre un percorso: come si chiama, di che organizzazione è e quali
 * tappe lo compongono, nell'ordine in cui vanno superate.
 *
 * L'organizzazione si sceglie per prima e in cima, ed è l'unica cosa che non
 * si può più cambiare dopo: le tappe puntano a roba del tenant, e spostare
 * il percorso altrove le lascerebbe a puntare fuori. Per l'organization
 * admin non c'è nessuna scelta da fare, il tenant è il suo.
 *
 * Le tappe si mandano al server tutte insieme e non una per volta: sono la
 * forma del percorso, ed è anche il motivo per cui riordinarle e toglierne
 * una di mezzo non ha bisogno di nient'altro che di questa finestra.
 *
 * Modificare un percorso vale subito per chi lo sta percorrendo, e la
 * finestra lo dice quando qualcuno ce l'ha: è la ragione per cui un percorso
 * è un modello invece di una copia per allievo, ma è anche il genere di cosa
 * che chi corregge un obiettivo alle sette di sera deve sapere prima di
 * premere. */

interface TrainingPathEditorModalProps {
  /** Il percorso da riscrivere, assente quando se ne compone uno nuovo. */
  path?: TrainingPath | null
  /** Le organizzazioni fra cui scegliere: vuoto per l'organization admin. */
  organizations: { id: string; name: string }[]
  /** Il tenant di chi compone, quando non è il super admin. */
  defaultOrganizationId?: string | null
  onClose: () => void
}

export default function TrainingPathEditorModal({
  path,
  organizations,
  defaultOrganizationId = null,
  onClose,
}: TrainingPathEditorModalProps) {
  const isEditing = Boolean(path)
  const [title, setTitle] = useState(path?.title ?? '')
  const [description, setDescription] = useState(path?.description ?? '')
  const [organizationId, setOrganizationId] = useState(
    path?.organization_id ?? defaultOrganizationId ?? organizations[0]?.id ?? '',
  )
  const [steps, setSteps] = useState<PathStepDraft[]>(
    path ? path.steps.map(draftFromStep) : [emptyDraft()],
  )
  const [validationError, setValidationError] = useState('')
  /* Quali campi del percorso li ha scritti una bozza e non una persona.
   * Serve alla regola con cui una proposta entra nel form, la stessa della
   * scheda persona: **scrive nei campi vuoti e in quelli che aveva scritto
   * lei, mai in quelli scritti a mano**. Senza la prima metà, riprovare con
   * un obiettivo scritto meglio non cambierebbe niente perché il titolo è
   * già pieno; senza la seconda, una seconda proposta porterebbe via la
   * correzione appena fatta, cioè la parte per cui la revisione esiste.
   *
   * Vive nella finestra aperta e non nel database: appena il percorso è
   * salvato, ogni campo è roba che qualcuno ha deciso di tenere. */
  const [fromDraft, setFromDraft] = useState<Set<'title' | 'description'>>(new Set())

  const createMutation = useCreatePath()
  const updateMutation = useUpdatePath()
  const isSaving = createMutation.isPending || updateMutation.isPending

  /* Il tenant delle tappe è quello del percorso: cambiando organizzazione
   * cambia il catalogo, e le tappe già scelte non ci sono più dentro. */
  const { data: content, isPending: isLoadingContent } = useAssignableContent(
    organizationId || null,
  )

  const failure = createMutation.error ?? updateMutation.error
  const error =
    validationError ||
    (failure ? (failure instanceof Error ? failure.message : 'Salvataggio non riuscito.') : '')

  const isComplete = useMemo(() => steps.every(isDraftComplete), [steps])
  const canSubmit = !isSaving && title.trim() !== '' && organizationId !== '' && isComplete

  const setStep = (index: number, next: PathStepDraft) =>
    setSteps((prev) => prev.map((s, i) => (i === index ? next : s)))

  /* Una proposta che entra nel form.
   *
   * Titolo e descrizione seguono la regola dei campi scritti a mano; **le
   * tappe le sostituisce tutte**, ed è la sola cosa che può fare: sono una
   * fila ordinata, e infilare una proposta dentro quello che c'è vorrebbe
   * dire un percorso che non ha composto né il modello né la persona. Il
   * pannello lo scrive prima di far premere, e non compare affatto su un
   * percorso che esiste già. */
  const applyDraft = (draft: TrainingPathDraft) => {
    setTitle((prev) => (prev.trim() === '' || fromDraft.has('title') ? draft.title : prev))
    setDescription((prev) =>
      prev.trim() === '' || fromDraft.has('description') ? (draft.description ?? '') : prev,
    )
    setFromDraft((prev) => {
      const next = new Set(prev)
      if (title.trim() === '' || prev.has('title')) next.add('title')
      if (description.trim() === '' || prev.has('description')) next.add('description')
      return next
    })
    setSteps(draft.steps.map(draftFromProposal))
    setValidationError('')
  }

  const handleSubmit = async () => {
    if (!canSubmit) {
      setValidationError(
        isComplete
          ? 'Serve un titolo e un’organizzazione.'
          : 'Ogni tappa deve puntare a un avatar o a un test.',
      )
      return
    }
    setValidationError('')
    createMutation.reset()
    updateMutation.reset()
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      organization_id: organizationId,
      steps: steps.map(toStepInput),
    }
    try {
      if (path) await updateMutation.mutateAsync({ pathId: path.id, payload })
      else await createMutation.mutateAsync(payload)
      onClose()
    } catch {
      // Il messaggio è nella mutation, il banner qui sopra lo mostra
    }
  }

  return (
    <ModalShell onClose={onClose} locked={isSaving} size="xl" padding="md">
      <ModalHeader
        icon={<PlusIcon size={24} stroke="#a78bfa" />}
        iconWrapperCls="border border-violet-500/30 bg-violet-500/10"
        title={isEditing ? 'Modifica il percorso' : 'Nuovo Percorso'}
        description={
          isEditing && path && path.assigned_count > 0
            ? `Le modifiche valgono subito per le ${path.assigned_count} persone che lo stanno percorrendo.`
            : 'Le tappe si superano in ordine: la successiva si apre quando la precedente è chiusa.'
        }
      />

      <div className="flex flex-col gap-4">
        <Field label="Titolo" htmlFor="path-title">
          <input
            id="path-title"
            className={`${formInputCls} w-full`}
            value={title}
            disabled={isSaving}
            /* Toccare un campo lo fa uscire dall'elenco di quelli scritti
               dalla bozza, e da quel momento è intoccabile: è la metà della
               regola che protegge una correzione appena fatta. */
            onChange={(e) => {
              setTitle(e.target.value)
              setFromDraft((prev) => {
                if (!prev.has('title')) return prev
                const next = new Set(prev)
                next.delete('title')
                return next
              })
            }}
            placeholder="Onboarding vendite"
          />
        </Field>

        <Field
          label="Descrizione"
          htmlFor="path-description"
          hint={<span className="text-xs text-slate-500">Facoltativa</span>}
        >
          <textarea
            id="path-description"
            className={textareaCls}
            rows={2}
            value={description}
            disabled={isSaving}
            onChange={(e) => {
              setDescription(e.target.value)
              setFromDraft((prev) => {
                if (!prev.has('description')) return prev
                const next = new Set(prev)
                next.delete('description')
                return next
              })
            }}
            placeholder="A chi è rivolto e cosa ci si aspetta alla fine"
          />
        </Field>

        {organizations.length > 0 && (
          <Field
            label="Organizzazione"
            htmlFor="path-organization"
            hint={
              isEditing ? (
                <span className="text-xs text-slate-500">
                  Non è modificabile: le tappe appartengono a questa organizzazione
                </span>
              ) : undefined
            }
          >
            <Select
              id="path-organization"
              value={organizationId}
              onChange={(value) => {
                setOrganizationId(value)
                // Il catalogo cambia con il tenant: le tappe scelte prima
                // non esistono nel nuovo, e tenerle sarebbe un percorso che
                // il server rifiuterebbe al salvataggio.
                setSteps([emptyDraft()])
              }}
              disabled={isEditing || isSaving}
              options={organizations.map((o) => ({ value: o.id, label: o.name }))}
            />
          </Field>
        )}

        {/* Solo su un percorso nuovo: su uno che esiste già le tappe le
            stanno percorrendo delle persone, e rigenerarle non sarebbe una
            bozza, sarebbe buttare il lavoro di qualcuno insieme al loro
            progresso. Sta sopra le tappe perché è da lì che possono
            arrivare, e sotto i campi del percorso perché anche quelli li
            riempie. */}
        {!isEditing && (
          <PathDraftPanel
            organizationId={organizationId}
            disabled={isSaving}
            onDrafted={applyDraft}
          />
        )}

        <div>
          <span className="mb-2 block text-xs font-medium tracking-wide text-slate-400">
            Tappe, nell'ordine in cui si superano
          </span>
          {/* Il riquadro tiene insieme intestazione, tappe e "aggiungi": senza,
              le righe senza card di sopra i 1024px si confonderebbero con i
              campi del percorso che le stanno sopra. */}
          <div className="rounded-xl border border-white/6 p-3">
            {isLoadingContent || !content ? (
              <LoadingState message="Caricamento del catalogo..." variant="modal" />
            ) : (
              <>
                <PathStepsHeader />
                <ol className="flex flex-col gap-2 lg:gap-0">
                  {steps.map((step, index) => (
                    <PathStepEditor
                      key={index}
                      step={step}
                      index={index}
                      total={steps.length}
                      content={content}
                      disabled={isSaving}
                      onChange={(next) => setStep(index, next)}
                      onMove={(to) => setSteps((prev) => moved(prev, index, to))}
                      onRemove={() => setSteps((prev) => prev.filter((_, i) => i !== index))}
                    />
                  ))}
                </ol>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setSteps((prev) => [...prev, emptyDraft()])}
                  className="mt-2 flex w-fit cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-white/5 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <PlusIcon size={13} />
                  Aggiungi Tappa
                </button>
                {content.avatars.length === 0 && content.simulations.length === 0 && (
                  <p className="mt-2 text-[0.82rem] text-slate-500">
                    Questa organizzazione non ha ancora avatar attivi né test pubblicati
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {error && <FormError message={error} />}

        <PrimaryButton variant="submit" onClick={handleSubmit} disabled={!canSubmit}>
          {isSaving && <Spinner variant="button" />}
          {isEditing ? 'Salva il percorso' : 'Crea il percorso'}
        </PrimaryButton>
      </div>
    </ModalShell>
  )
}
