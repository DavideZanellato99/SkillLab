/* Il controllo del serbatoio, in testa alle cinquanta domande da rileggere.
 *
 * Il problema che risolve non è che la revisione umana non venga fatta: è che
 * cinquanta righe sono tutte uguali, e chi le apre non ha nessun modo di
 * sapere da quale cominciare. Il pannello dà quell'ordine.
 *
 * **Non blocca niente.** La pubblicazione resta possibile con tutte le
 * segnalazioni aperte, ed è scritto qui dentro: due domande simili sono un
 * difetto piccolo, e un controllo che sbaglia e blocca è peggio di uno che
 * sbaglia e avvisa. Quello che ferma la pubblicazione resta quello che la
 * fermava già, cioè una domanda a metà.
 *
 * **L'elenco delle domande non si riordina**, e le segnalazioni portano al
 * punto invece di spostarlo. Riordinarle vorrebbe dire cambiare il numero
 * accanto a ogni domanda, che è anche la sua posizione nel serbatoio e il
 * modo in cui una segnalazione la nomina: chi sta correggendo la 12 se la
 * ritroverebbe altrove al controllo successivo. Cliccare la segnalazione
 * porta alla domanda, che è la stessa cosa senza spostare niente. */

import type { SimulationReview, SimulationReviewFinding } from '../services/simulations'
import FormError from './FormError'
import PrimaryButton from './PrimaryButton'
import Spinner from './Spinner'
import Tooltip from './Tooltip'
import { formatDateTime } from './lastAccess'
import { SparkleIcon } from './icons'

/* Le tre gravità, con il colore che hanno ovunque nell'app: rosso dove
 * qualcosa è sbagliato, ambra dove è dubbio, neutro dove è solo da sapere. */
const SEVERITY_STYLE: Record<SimulationReviewFinding['severity'], string> = {
  high: 'border-red-500/25 bg-red-500/8 text-red-300',
  medium: 'border-amber-500/25 bg-amber-500/8 text-amber-300',
  low: 'border-white/8 bg-white/3 text-slate-400',
}

/* Cosa è stato trovato, detto in due parole. La parola sta accanto al
 * messaggio e non al posto suo: il messaggio dice cosa non torna su quella
 * domanda, l'etichetta dice di che specie di difetto si tratta, e chi rivede
 * impara presto a saltare quelle che ha deciso di ignorare. */
const KIND_LABEL: Record<SimulationReviewFinding['kind'], string> = {
  unsupported: 'Risposta non sostenuta',
  duplicate: 'Domanda ripetuta',
  implausible_options: 'Alternative deboli',
  longest_correct: 'Corretta troppo lunga',
  answer_position: 'Risposte sbilanciate',
}

function Finding({
  finding,
  onGoTo,
}: {
  finding: SimulationReviewFinding
  onGoTo: (position: number) => void
}) {
  const first = finding.positions[0]
  return (
    <li className={`rounded-xl border px-3 py-2 ${SEVERITY_STYLE[finding.severity]}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[0.65rem] font-semibold uppercase tracking-widest opacity-80">
          {KIND_LABEL[finding.kind]}
        </span>
        {/* Le segnalazioni sul serbatoio nel suo insieme non portano a
            nessuna domanda: non c'è una riga da correggere, c'è una fila da
            rimescolare. */}
        {finding.positions.map((position) => (
          <button
            key={position}
            type="button"
            onClick={() => onGoTo(position)}
            className="cursor-pointer rounded-md bg-white/8 px-1.5 py-0.5 text-[0.7rem] font-semibold tabular-nums transition hover:bg-white/16"
          >
            {position}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[0.82rem] leading-relaxed text-slate-300">{finding.message}</p>
      {first !== undefined && (
        <button
          type="button"
          onClick={() => onGoTo(first)}
          className="mt-1 cursor-pointer text-xs text-violet-400 underline-offset-2 hover:underline"
        >
          Vai alla domanda {first}
        </button>
      )}
    </li>
  )
}

export default function SimulationReviewPanel({
  review,
  isPending,
  error,
  disabled = false,
  onRun,
  onGoTo,
}: {
  /** L'esito dell'ultimo controllo, null se non è mai stato chiesto. */
  review: SimulationReview | null
  isPending: boolean
  error: string
  disabled?: boolean
  onRun: () => void
  onGoTo: (position: number) => void
}) {
  const findings = review?.findings ?? []

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-white/6 bg-white/3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[0.9rem] font-semibold text-slate-100">Controllo delle Domande</h3>
            {review?.is_stale && (
              <Tooltip content="Le domande sono cambiate dopo il controllo: l'esito si riferisce all'archivio precedente.">
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-widest text-amber-400">
                  Da ripetere
                </span>
              </Tooltip>
            )}
          </div>
          <span className="text-xs leading-relaxed text-slate-500">
            {review
              ? `Controllato il ${formatDateTime(review.reviewed_at)}, su ${review.checked} domande verificabili. Non blocca la pubblicazione, indica da dove conviene cominciare la revisione.`
              : 'Cerca le domande ripetute, quelle la cui risposta il documento non sostiene e le alternative che si riconoscono senza sapere la procedura.'}
          </span>
        </div>

        <PrimaryButton
          onClick={onRun}
          disabled={disabled || isPending}
          icon={isPending ? <Spinner variant="button" /> : <SparkleIcon size={15} />}
          className="shrink-0"
        >
          {isPending ? 'Controllo in corso...' : review ? 'Ricontrolla' : 'Controlla le domande'}
        </PrimaryButton>
      </div>

      {error && <FormError message={error} />}

      {isPending && (
        <p className="text-xs italic text-slate-500">
          Le domande vengono indicizzate e rilette accanto ai passaggi che citano. L'operazione può
          richiedere qualche minuto.
        </p>
      )}

      {/* Una lista vuota è un esito e va detto: senza, chi ha appena premuto
          non sa se il controllo è passato o se non è partito. */}
      {review && !isPending && findings.length === 0 && (
        <p className="text-[0.85rem] text-emerald-400">
          Nessun rilievo: nessuna domanda ripetuta, nessuna risposta che il documento non sostenga
        </p>
      )}

      {review && !isPending && findings.length > 0 && (
        <ul className="flex list-none flex-col gap-2">
          {findings.map((finding, index) => (
            <Finding key={index} finding={finding} onGoTo={onGoTo} />
          ))}
        </ul>
      )}
    </div>
  )
}
