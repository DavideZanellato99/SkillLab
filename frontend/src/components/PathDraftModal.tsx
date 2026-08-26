/* Farsi comporre un percorso dal modello, prima di correggerlo nel form.
 *
 * È il gemello della bozza di scheda persona, e adesso lo è anche nella
 * forma: una finestra che si apre sopra il form, consegna la proposta a chi
 * l'ha aperta e si chiude. Il patto è lo stesso, quello che torna è **una
 * proposta da rileggere**, non un percorso.
 *
 * Prima era un riquadro sempre aperto in mezzo alla finestra di
 * composizione, e teneva il posto fra i campi del percorso e le tappe anche
 * a chi il percorso lo stava scrivendo a mano. Le motivazioni le portano
 * adesso le tappe stesse (vedi `PathStepEditor`): erano un elenco che
 * parlava di righe che stavano da un'altra parte.
 *
 * Si apre solo per un percorso nuovo. Su uno che esiste già le tappe le
 * stanno percorrendo delle persone, e rigenerarle non sarebbe una bozza,
 * sarebbe buttare il lavoro di qualcuno insieme al loro progresso. */

import { useState } from 'react'
import { useDraftPath } from '../hooks/useTraining'
import { errorMessage } from '../services/errors'
import type { TrainingPathDraft } from '../services/training'
import { fieldCls, labelCls, textareaCls } from './Field'
import FormError from './FormError'
import ModalShell, { ModalHeader } from './ModalShell'
import PrimaryButton from './PrimaryButton'
import Spinner from './Spinner'
import { SparkleIcon } from './icons'

/* Lo stesso minimo che il server pretende sull'obiettivo, ripetuto qui solo
 * per dirlo prima di far partire una richiesta che verrebbe rifiutata. Da tre
 * parole il modello inventa un corso suo e mette in fila mezzo catalogo. */
const MIN_GOAL = 30

export default function PathDraftModal({
  organizationId,
  onClose,
  onDrafted,
}: {
  /** Il tenant di cui usare il catalogo, vuoto finché non è stato scelto. */
  organizationId: string
  onClose: () => void
  /** La proposta pronta, che il form fa entrare con le sue regole. */
  onDrafted: (draft: TrainingPathDraft) => void
}) {
  const [goal, setGoal] = useState('')
  const draft = useDraftPath()
  const isPending = draft.isPending

  const error = errorMessage(draft.error, 'Generazione non riuscita.')

  const tooShort = goal.trim().length < MIN_GOAL

  const generate = async () => {
    if (tooShort || organizationId === '') return
    draft.reset()
    try {
      const result = await draft.mutateAsync({ goal: goal.trim(), organizationId })
      onDrafted(result)
      onClose()
    } catch {
      // Il messaggio è nella mutation, il banner qui sopra lo mostra
    }
  }

  return (
    <ModalShell onClose={onClose} locked={isPending} size="md" padding="md" elevated>
      {/* L'intestazione è quella di tutte le altre finestre e non una scritta
          disegnata qui: le tre modali di questa sezione si aprono una dentro
          l'altra, e l'icona in cima è il modo in cui si distinguono a colpo
          d'occhio. Da `ModalHeader` arriva anche il nome che il pannello si
          dà da tastiera, che prima andava ripetuto a mano in `label`. */}
      <ModalHeader
        icon={<SparkleIcon size={24} stroke="#a78bfa" />}
        iconWrapperCls="border border-violet-500/30 bg-violet-500/10"
        title="Proponi un Percorso"
        description="Il modello seleziona gli avatar e i test di questa organizzazione e li dispone in sequenza. È una proposta da rileggere: le tappe restano modificabili nel form, e il percorso viene creato solo alla conferma."
      />

      {error && <FormError message={error} />}

      <div className="flex flex-col gap-4">
        <div className={fieldCls}>
          <label className={labelCls} htmlFor="path-goal">
            L'obiettivo formativo
          </label>
          <textarea
            id="path-goal"
            className={textareaCls}
            rows={5}
            value={goal}
            disabled={isPending}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Formare un nuovo addetto allo sportello: deve saper gestire i reclami sulle commissioni e conoscere la procedura di sblocco carta"
          />
          {/* Il conto compare solo finché serve: a soglia superata non è più
              una cosa da sapere. */}
          {tooShort && goal.length > 0 && (
            <p className="text-[0.7rem] text-slate-500">
              Ancora {MIN_GOAL - goal.trim().length} caratteri: da poche parole il modello
              comporrebbe un corso non aderente.
            </p>
          )}
        </div>

        {/* Da dire prima di far premere, non dopo: le tappe sono una fila
            ordinata, e infilare una proposta dentro quello che c'è darebbe un
            percorso che non ha composto né il modello né la persona. */}
        <p className="text-[0.72rem] leading-relaxed text-slate-500">
          Le tappe già inserite vengono sostituite dalla proposta. Titolo e descrizione restano come
          sono, se sono stati scritti a mano.
        </p>

        <PrimaryButton
          type="button"
          variant="submit"
          onClick={generate}
          disabled={isPending || tooShort || organizationId === ''}
        >
          {isPending ? (
            <>
              <Spinner variant="button" />
              Composizione in corso...
            </>
          ) : (
            'Proponi un percorso'
          )}
        </PrimaryButton>
      </div>
    </ModalShell>
  )
}
