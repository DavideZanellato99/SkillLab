/* I quadri d'insieme di un percorso, chiesti e letti dalla sua scheda.
 *
 * Una finestra e non una terza linguetta: si apre dal percorso di cui parla,
 * che è anche il solo posto da cui la domanda «dove si inceppa» viene in
 * mente, cioè dopo aver letto quante persone lo stanno percorrendo.
 *
 * **Aperto c'è sempre uno solo, e di default è l'ultimo.** Le versioni
 * precedenti stanno sotto in righe da una riga e si aprono al posto suo:
 * quello che vale è il quadro di adesso, e una schermata che ne mostrasse due
 * per intero obbligherebbe a decidere a quale credere. Che una vecchia sia
 * aperta lo dice una fascia, perché leggere per attuale un testo scritto due
 * mesi fa è l'unico modo in cui questa schermata può ingannare.
 *
 * Il disegno di un quadro e quello dello storico stanno in due file loro: qui
 * restano la scelta di quale mostrare, il bottone che ne fa scrivere uno
 * nuovo, e i casi in cui non ce n'è ancora nessuno. */

import { useState } from 'react'
import { useGeneratePathDebriefing, usePathDebriefings } from '../hooks/useDebriefing'
import type { TrainingPath } from '../services/training'
import { errorMessage } from '../services/errors'
import DebriefingHistory from './DebriefingHistory'
import FormError from './FormError'
import LoadingState from './LoadingState'
import ModalShell, { ModalHeader } from './ModalShell'
import PathDebriefingReport from './PathDebriefingReport'
import PrimaryButton from './PrimaryButton'
import Tooltip from './Tooltip'
import { formatDateTime } from './dateFormat'
import { SparkleIcon } from './icons'

/* Le stesse tre persone che il server pretende, ripetute qui solo per dirlo
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
  const { data: debriefings, isPending, error } = usePathDebriefings(path.id)
  const generate = useGeneratePathDebriefing(path.id)
  /* Quale versione è aperta. Un id e non un indice: dopo una generazione la
   * lista si sposta di uno, e un indice terrebbe aperta la riga sbagliata. */
  const [openId, setOpenId] = useState<string | null>(null)

  const loadError = errorMessage(error, 'Lettura non riuscita.')
  const generateError = errorMessage(generate.error, 'Generazione non riuscita.')

  const storico = debriefings ?? []
  const latest = storico[0]
  /* L'ultimo finché non si sceglie, e di nuovo l'ultimo se quello scelto non
   * c'è più: dopo una generazione la lista cambia sotto la selezione. */
  const shown = storico.find((d) => d.id === openId) ?? latest
  const isLatestShown = shown?.id === latest?.id

  /* Sotto la soglia il bottone non c'è, e al suo posto c'è il motivo: un
   * bottone spento senza spiegazione manda a cercare cosa si è sbagliato. */
  const tooFewPeople = path.assigned_count < MIN_PEOPLE
  /* Rigenerare senza niente di nuovo darebbe un quadro che dice le stesse
   * cose, e il server lo rifiuta: il bottone lo dice prima. */
  const nothingNew = latest !== undefined && latest.stale_reason === null

  const generateButton = (
    <PrimaryButton
      onClick={() => generate.mutate()}
      disabled={generate.isPending || nothingNew}
      className="shrink-0"
    >
      {generate.isPending
        ? 'Lettura delle prove in corso...'
        : latest
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
              {latest?.stale_reason && (
                <Tooltip content={STALE_REASONS[latest.stale_reason]}>
                  <span className="w-fit rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-widest text-amber-400">
                    Da aggiornare
                  </span>
                </Tooltip>
              )}
              {shown && (
                <span className="text-xs text-slate-500">
                  Scritto il {formatDateTime(shown.created_at)}, richiesto da {shown.requested_by}
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

          {storico.length === 0 && !tooFewPeople && !generate.isPending && (
            <p className="py-4 text-center text-[0.85rem] italic text-slate-500">
              Nessun quadro d'insieme ancora scritto per questo percorso
            </p>
          )}

          {shown && !generate.isPending && (
            <div className="flex flex-col gap-4">
              {/* Una versione vecchia riaperta lo dice in chiaro, e il modo di
                  tornare all'attuale sta nella stessa riga che avvisa. */}
              {!isLatestShown && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2">
                  <span className="text-[0.8rem] text-amber-300">
                    Stai leggendo un quadro precedente, scritto il{' '}
                    {formatDateTime(shown.created_at)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenId(null)}
                    className="text-[0.8rem] font-semibold text-amber-300 underline underline-offset-2 hover:text-amber-200"
                  >
                    Torna a quello attuale
                  </button>
                </div>
              )}

              <PathDebriefingReport debriefing={shown} />

              {/* Lo stesso elenco dello storico di una persona, che riceve
                  righe e non quadri: qui si dice quali dei propri campi sono
                  le cinque cose che una riga mostra. */}
              <DebriefingHistory
                versions={storico.map((d) => ({
                  id: d.id,
                  createdAt: d.created_at,
                  direction: d.direction,
                  average: d.conversation_average,
                  delta: d.conversation_average_delta,
                }))}
                currentId={shown.id}
                onSelect={(id) => setOpenId(id)}
              />
            </div>
          )}
        </div>
      )}
    </ModalShell>
  )
}
