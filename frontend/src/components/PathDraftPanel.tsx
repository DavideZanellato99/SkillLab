/* Farsi comporre un percorso dal modello, dentro la finestra in cui poi lo si
 * corregge.
 *
 * È il gemello della bozza di scheda persona, e il patto è lo stesso: quello
 * che torna è **una proposta da rileggere**, non un percorso. Il pannello lo
 * dice prima e lo ripete dopo, perché il momento in cui serve saperlo è
 * quello in cui il form si è appena riempito di roba che non ha scritto
 * nessuno.
 *
 * Le motivazioni stanno qui e non sulle righe delle tappe. Appartengono alla
 * proposta e non alla tappa: si leggono una volta, mentre si decide se
 * tenerla, e appese a una riga che poi si sposta, si cambia e si cancella
 * diventerebbero didascalie di qualcosa che nessuno ha più proposto.
 *
 * Compare solo quando si compone un percorso nuovo. Su uno che esiste già le
 * tappe le stanno percorrendo delle persone, e rigenerarle non sarebbe una
 * bozza, sarebbe buttare il lavoro di qualcuno insieme al loro progresso. */

import { useState } from 'react'
import { useDraftPath } from '../hooks/useTraining'
import type { TrainingPathDraft } from '../services/training'
import Field, { textareaCls } from './Field'
import FormError from './FormError'
import PrimaryButton from './PrimaryButton'
import Spinner from './Spinner'
import { SparkleIcon } from './icons'

/* Lo stesso minimo che il server pretende sull'obiettivo, ripetuto qui solo
 * per dirlo prima di far partire una richiesta che verrebbe rifiutata. Da tre
 * parole il modello inventa un corso suo e mette in fila mezzo catalogo. */
const MIN_GOAL = 30

export default function PathDraftPanel({
  organizationId,
  disabled = false,
  onDrafted,
}: {
  /** Il tenant di cui usare il catalogo, vuoto finché non è stato scelto. */
  organizationId: string
  disabled?: boolean
  onDrafted: (draft: TrainingPathDraft) => void
}) {
  const [goal, setGoal] = useState('')
  const [proposal, setProposal] = useState<TrainingPathDraft | null>(null)
  const draft = useDraftPath()

  const error = draft.error
    ? draft.error instanceof Error
      ? draft.error.message
      : 'Generazione non riuscita.'
    : ''

  const tooShort = goal.trim().length < MIN_GOAL
  const canDraft = !disabled && !draft.isPending && organizationId !== '' && !tooShort

  const handleDraft = async () => {
    draft.reset()
    try {
      const result = await draft.mutateAsync({ goal: goal.trim(), organizationId })
      setProposal(result)
      onDrafted(result)
    } catch {
      // Il messaggio è nella mutation, il banner qui sotto lo mostra
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-violet-500/20 bg-violet-600/6 p-3">
      <Field
        label="Fatti proporre un percorso"
        htmlFor="path-goal"
        hint={<span className="text-xs text-slate-500">Facoltativo</span>}
      >
        <textarea
          id="path-goal"
          className={textareaCls}
          rows={2}
          value={goal}
          disabled={disabled || draft.isPending}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Formare un nuovo addetto allo sportello: deve saper gestire i reclami sulle commissioni e conoscere la procedura di sblocco carta"
        />
      </Field>

      <p className="text-xs leading-relaxed text-slate-500">
        Il modello sceglie fra gli avatar e i test di questa organizzazione e li mette in fila. È
        una proposta da rileggere: le tappe restano modificabili qui sotto, e il percorso nasce solo
        quando lo crei.
      </p>

      {error && <FormError message={error} />}

      <PrimaryButton
        onClick={handleDraft}
        disabled={!canDraft}
        icon={draft.isPending ? <Spinner variant="button" /> : <SparkleIcon size={15} />}
        className="w-fit"
      >
        {draft.isPending ? 'Il modello sta componendo...' : 'Proponi un percorso'}
      </PrimaryButton>

      {/* Non è un messaggio di successo: in questo momento il form è pieno di
          roba che non ha scritto nessuno, e la cosa da dire è quella. */}
      {proposal && !draft.isPending && (
        <div className="flex flex-col gap-2 border-t border-white/6 pt-3">
          <p className="text-[0.82rem] text-slate-300">
            Proposte <strong className="text-slate-100">{proposal.steps.length}</strong>{' '}
            {proposal.steps.length === 1 ? 'tappa' : 'tappe'}, da rileggere una per una prima di
            creare il percorso.
          </p>
          <ol className="flex list-none flex-col gap-1.5">
            {proposal.steps.map((step, index) => (
              <li
                key={`${step.avatar_id ?? step.simulation_id}-${index}`}
                className="flex gap-2 text-xs leading-relaxed text-slate-400"
              >
                <span className="shrink-0 font-semibold tabular-nums text-violet-400">
                  {index + 1}.
                </span>
                <span>{step.reason || 'Nessuna motivazione indicata'}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
