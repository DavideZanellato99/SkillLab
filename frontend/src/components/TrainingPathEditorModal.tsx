import { useMemo, useState } from 'react'
import { useAssignableContent, useCreatePath, useUpdatePath } from '../hooks/useTraining'
import type { TrainingPath } from '../services/training'
import Field, { cardInputCls, textareaCls } from './Field'
import FormError from './FormError'
import LoadingState from './LoadingState'
import ModalShell, { ModalHeader } from './ModalShell'
import PathStepEditor from './PathStepEditor'
import PrimaryButton from './PrimaryButton'
import Select from './Select'
import Spinner from './Spinner'
import { PlusIcon } from './icons'
import { moved } from './listOrder'
import type { PathStepDraft } from './pathStepDraft'
import { draftFromStep, emptyDraft, isDraftComplete, toStepInput } from './pathStepDraft'

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
    <ModalShell onClose={onClose} locked={isSaving} size="sheet" padding="md">
      <ModalHeader
        icon={<PlusIcon size={24} stroke="#a78bfa" />}
        iconWrapperCls="border border-violet-500/30 bg-violet-500/10"
        title={isEditing ? 'Modifica il percorso' : 'Nuovo percorso'}
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
            className={cardInputCls}
            value={title}
            disabled={isSaving}
            onChange={(e) => setTitle(e.target.value)}
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
            onChange={(e) => setDescription(e.target.value)}
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
                  Non si cambia: le tappe appartengono a questo tenant
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

        <div>
          <span className="mb-2 block text-xs font-medium tracking-wide text-slate-400">
            Tappe, nell'ordine in cui si superano
          </span>
          {isLoadingContent || !content ? (
            <LoadingState message="Caricamento del catalogo..." variant="modal" />
          ) : (
            <>
              <ol className="flex flex-col gap-2">
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
                Aggiungi tappa
              </button>
              {content.avatars.length === 0 && content.simulations.length === 0 && (
                <p className="mt-2 text-[0.82rem] text-slate-500">
                  Questa organizzazione non ha ancora avatar attivi né test pubblicati
                </p>
              )}
            </>
          )}
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
