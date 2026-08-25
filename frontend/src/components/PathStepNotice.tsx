import { useRef } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useMyAssignments } from '../hooks/useTraining'
import { isStandardUser } from '../services/auth'
import type { StepKind, StepProgress } from '../services/training'
import StepDeadline from './StepDeadline'
import Tooltip from './Tooltip'
import { CheckIcon, TargetIcon } from './icons'
import { criteriaMet, formatScore, isStepDone, stepById, stepInProgressFor } from './trainingFormat'

/* La striscia che dice, dentro la prova, che quella prova è la tappa di un
 * percorso, e a che punto la tappa sta.
 *
 * La chat e il simulatore non sapevano niente dei percorsi: si usciva dalla
 * mappa sapendo che serviva un 7,5 e si arrivava su una schermata che quel
 * numero non lo nominava, quindi l'obiettivo andava tenuto a mente per tutta
 * la conversazione, e per tornare al percorso si premeva indietro.
 *
 * **Lo dicono i dati e non da dove si arriva.** Non è uno stato passato dal
 * collegamento della tappa: è la tappa di adesso di un percorso aperto che
 * punta proprio a questo avatar o a questo test (vedi `stepInProgressFor`).
 * Con lo stato del collegamento la striscia sarebbe comparsa venendo dalla
 * mappa e sparita entrando dalla galleria, pur essendo la stessa prova che
 * conta allo stesso modo, e sarebbe sparita anche solo ricaricando la pagina.
 *
 * Guarda la sola tappa di adesso, quindi non compare sulle prove che il
 * percorso chiederà più avanti: quelle non contano ancora, e annunciarle
 * prometterebbe un avanzamento che non arriva.
 *
 * **Quanto ci si è andati vicino è il meglio fatto sulla tappa**, non il voto
 * della conversazione a schermo: quello lo dice già la pastiglia nella testata,
 * e la domanda a cui questa striscia risponde è un'altra, se quel voto basta.
 * Il numero arriva dallo stesso posto dell'obiettivo, cioè dal server, che il
 * progresso di una tappa lo deriva dalle prove svolte; a farlo cambiare
 * nell'istante in cui la valutazione arriva è l'invalidazione che quella
 * mutation fa (vedi useEvaluateConversation), altrimenti qui resterebbe il
 * numero di un minuto fa proprio nel momento in cui l'obiettivo si è appena
 * raggiunto.
 *
 * **Superata la tappa la striscia resta e cambia parola.** La tappa di adesso
 * a quel punto è la successiva, quindi la ricerca per bersaglio non troverebbe
 * più niente e la striscia sparirebbe nell'unico momento in cui c'è una bella
 * notizia da dare: quella che si è vista in corso su questa schermata resta
 * quindi ricordata, e la si ritrova per id (vedi `stepById`) per leggerne
 * l'esito. Vale per la schermata che si sta guardando e non oltre: cambiando
 * avatar o test la memoria riparte, e su una prova entrata dalla galleria
 * settimane dopo non compare niente.
 *
 * A chi amministra non compare mai, e non perché sia nascosta: la rotta dei
 * propri percorsi gli risponde 403, quindi la domanda non gliela facciamo. */

/** Il meglio fatto sulla tappa, accanto all'obiettivo. */
function BestSoFar({ step }: { step: StepProgress }) {
  if (step.best_score === null) return <span className="text-slate-500">nessun tentativo</span>
  const reached = step.best_score >= step.target_score
  return (
    <span className="text-slate-400">
      migliore{' '}
      <strong className={`font-semibold ${reached ? 'text-emerald-400' : 'text-orange-400'}`}>
        {formatScore(step.best_score)}
      </strong>
    </span>
  )
}

export default function PathStepNotice({
  kind,
  targetId,
  className = '',
}: {
  kind: StepKind
  /** L'avatar o la simulazione a schermo, assente finché la pagina non la sa. */
  targetId?: string
  /** Solo il posto della striscia nella schermata che la ospita. */
  className?: string
}) {
  const { user } = useAuth()
  const { data: assignments = [] } = useMyAssignments(isStandardUser(user))

  /* La tappa vista in corso su questa prova, per ritrovarla quando smette di
     essere quella di adesso. È legata al bersaglio a schermo: passando a un
     altro avatar la memoria non vale più, o la striscia parlerebbe della
     tappa di prima sulla prova sbagliata. */
  const seen = useRef<{ targetId: string; stepId: string } | null>(null)

  const live = stepInProgressFor(assignments, kind, targetId)
  if (live && targetId) seen.current = { targetId, stepId: live.step.id }
  else if (seen.current && seen.current.targetId !== targetId) seen.current = null

  const found = live ?? (seen.current ? stepById(assignments, seen.current.stepId) : null)
  if (!found) return null
  const { assignment, step } = found

  const done = isStepDone(step)
  const met = criteriaMet(step)
  const criteria = step.criteria_targets

  return (
    <aside
      className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border px-4 py-2.5 text-[0.82rem] backdrop-blur-md ${
        done ? 'border-emerald-500/30 bg-emerald-500/8' : 'border-violet-600/25 bg-violet-600/8'
      } ${className}`}
      aria-label="Tappa di un percorso"
    >
      <span className="flex min-w-0 items-center gap-2 text-slate-300">
        {done ? (
          <CheckIcon size={15} className="shrink-0 text-emerald-400" />
        ) : (
          <TargetIcon size={15} className="shrink-0 text-violet-400" />
        )}
        <span className="truncate">
          Tappa {step.position} di {assignment.steps.length} di{' '}
          <strong className="font-semibold text-slate-100">{assignment.path_title}</strong>
          {done && <span className="text-emerald-400"> superata</span>}
        </span>
      </span>

      <span className="text-slate-400">
        Obiettivo{' '}
        <strong className="font-semibold text-slate-100">{formatScore(step.target_score)}</strong>{' '}
        su 10
        {/* Il meglio fatto sulla tappa, che è quanto manca per superarla: su
            una tappa già chiusa il numero c'è comunque, ed è con quello che è
            stata chiusa. */}
        {', '}
        <BestSoFar step={step} />
        {/* Le soglie sui criteri contate e non elencate: sono la condizione che
            la media non assorbe, e vanno sapute, ma qui sopra c'è una prova da
            cominciare e sei righe di nomi la coprirebbero. Quante ne mancano è
            la ragione per cui una tappa con il voto già raggiunto può restare
            aperta; per esteso stanno nel riquadro della tappa, a un clic. */}
        {criteria.length > 0 && (
          <Tooltip
            content={criteria
              .map(
                (target) =>
                  `${target.label} ${formatScore(target.target)}, migliore ${
                    step.best_criteria_scores[target.key] !== undefined
                      ? formatScore(step.best_criteria_scores[target.key])
                      : '—'
                  }`,
              )
              .join(' · ')}
          >
            <span className="ml-1.5 cursor-help border-b border-dotted border-slate-600">
              criteri{' '}
              <strong
                className={`font-semibold ${
                  met === criteria.length ? 'text-emerald-400' : 'text-orange-400'
                }`}
              >
                {met} di {criteria.length}
              </strong>
            </span>
          </Tooltip>
        )}
      </span>

      {/* Su una tappa chiusa il termine non serve più: o è stato rispettato, e
          lo dice lo stato, o non lo è stato, e la targhetta del percorso lo
          dice meglio di una data. */}
      {!done && <StepDeadline step={step} />}

      {/* Alla propria tappa, già aperta: si torna al percorso per rileggere
          cosa serve, o per vedere cosa viene dopo quella appena chiusa. */}
      <Link
        to={`/app/percorsi/${assignment.id}?tappa=${step.position}`}
        className={`ml-auto shrink-0 whitespace-nowrap font-medium no-underline transition ${
          done ? 'text-emerald-400 hover:text-emerald-300' : 'text-violet-400 hover:text-violet-300'
        }`}
      >
        {done ? 'Vai al percorso' : 'Vedi il percorso'}
      </Link>
    </aside>
  )
}
