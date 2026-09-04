/* Il quadro d'insieme di un percorso, chiesto e letto dalla sua scheda.
 *
 * Una finestra e non una terza linguetta: si apre dal percorso di cui parla,
 * che è anche il solo posto da cui la domanda «dove si inceppa» viene in
 * mente, cioè dopo aver letto quante persone lo stanno percorrendo.
 *
 * Ce n'è uno solo e la generazione successiva lo sostituisce, quindi qui non
 * c'è nessuno storico da sfogliare: su un gruppo il confronto con la versione
 * di prima non si può fare, perché fra le due qualcuno è stato aggiunto e
 * qualcuno ritirato.
 *
 * Il disegno del quadro sta in un file suo: qui restano il bottone che ne fa
 * scrivere uno, la fascia che avvisa quando quello a schermo non vale più, e
 * i casi in cui non ce n'è ancora nessuno. */

import { useGeneratePathDebriefing, usePathDebriefing } from '../hooks/useDebriefing'
import type { TrainingPath } from '../services/training'
import { errorMessage } from '../services/errors'
import FormError from './FormError'
import LoadingState from './LoadingState'
import ModalShell, { ModalHeader } from './ModalShell'
import PathDebriefingReport from './PathDebriefingReport'
import PrimaryButton from './PrimaryButton'
import Tooltip from './Tooltip'
import { formatDateTime } from './dateFormat'
import { SparkleIcon } from './icons'

/* Le stesse due persone che il server pretende, ripetute qui solo per dirlo
 * prima di far partire una richiesta che verrebbe rifiutata. La regola che
 * vale resta quella del server, che risponde 409 con il conto esatto. */
const MIN_PEOPLE = 3

/** Cosa dire quando il quadro a schermo non vale più, per come è invecchiato. */
const STALE_REASONS = {
  prove: 'Il gruppo ha svolto altre prove dopo che il quadro è stato scritto',
  percorso: 'Le tappe del percorso sono state riscritte dopo che il quadro è stato scritto',
} as const

export default function PathDebriefingModal({
  path,
  onClose,
}: {
  path: TrainingPath
  onClose: () => void
}) {
  const { data: debriefing, isPending, error } = usePathDebriefing(path.id)
  const generate = useGeneratePathDebriefing(path.id)

  const loadError = errorMessage(error, 'Lettura non riuscita.')
  const generateError = errorMessage(generate.error, 'Generazione non riuscita.')

  /* Sotto la soglia il bottone non c'è, e al suo posto c'è il motivo: un
   * bottone spento senza spiegazione manda a cercare cosa si è sbagliato. */
  const tooFewPeople = path.assigned_count < MIN_PEOPLE
  /* Rigenerare senza niente di nuovo darebbe un quadro che dice le stesse
   * cose, e il server lo rifiuta: il bottone lo dice prima. */
  const nothingNew = debriefing != null && debriefing.stale_reason === null

  const generateButton = (
    <PrimaryButton
      onClick={() => generate.mutate()}
      disabled={generate.isPending || nothingNew}
      className="shrink-0"
    >
      {generate.isPending
        ? 'Lettura delle prove in corso...'
        : debriefing
          ? 'Genera un quadro aggiornato'
          : "Genera il quadro d'insieme"}
    </PrimaryButton>
  )

  return (
    <ModalShell onClose={onClose} locked={generate.isPending} size="lg" padding="md">
      <ModalHeader
        icon={<SparkleIcon size={24} stroke="#a78bfa" />}
        iconWrapperCls="border border-violet-500/30 bg-violet-500/10"
        title="Quadro d'Insieme"
        description={`Dove «${path.title}» si inceppa, e cosa si ripete fra le persone che lo stanno percorrendo. Parla del gruppo e delle tappe: chi è fermo dove sta nell'elenco degli assegnati.`}
      />

      {loadError && <FormError message={loadError} />}
      {generateError && <FormError message={generateError} />}

      {isPending ? (
        <LoadingState message="Caricamento del quadro d'insieme..." variant="modal" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              {debriefing?.stale_reason && (
                <Tooltip content={STALE_REASONS[debriefing.stale_reason]}>
                  <span className="w-fit rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-widest text-amber-400">
                    Da aggiornare
                  </span>
                </Tooltip>
              )}
              {debriefing && (
                <span className="text-xs text-slate-500">
                  Scritto il {formatDateTime(debriefing.written_at)}, richiesto da{' '}
                  {debriefing.requested_by}
                </span>
              )}
            </div>

            {/* Spento quando non c'è niente di nuovo da leggere, con il motivo
                nel tooltip: `wrap` perché un elemento disabilitato non emette
                eventi del mouse, quindi senza involucro il motivo non si
                vedrebbe proprio nel caso in cui serve. */}
            {!tooFewPeople &&
              (nothingNew ? (
                <Tooltip
                  content="Nessuna prova nuova e nessuna tappa cambiata dall'ultimo quadro"
                  wrap
                >
                  {generateButton}
                </Tooltip>
              ) : (
                generateButton
              ))}
          </div>

          {generate.isPending && (
            <LoadingState
              message="Lettura delle prove del gruppo in corso. L'operazione può richiedere qualche minuto."
              variant="modal"
            />
          )}

          {tooFewPeople && (
            <p className="py-4 text-center text-[0.85rem] italic text-slate-500">
              Servono almeno {MIN_PEOPLE} persone in percorso per un quadro d'insieme. Con meno il
              quadro del gruppo sarebbe la somma dei quadri individuali, che dicono di più
            </p>
          )}

          {!debriefing && !tooFewPeople && !generate.isPending && (
            <p className="py-4 text-center text-[0.85rem] italic text-slate-500">
              Nessun quadro d'insieme ancora scritto per questo percorso
            </p>
          )}

          {debriefing && !generate.isPending && <PathDebriefingReport debriefing={debriefing} />}
        </div>
      )}
    </ModalShell>
  )
}
