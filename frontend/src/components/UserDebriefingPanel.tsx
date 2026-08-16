/* Il quadro d'insieme su una persona, dentro la sua riga del report attività.
 *
 * Le altre due linguette elencano le prove una per una, questa risponde alla
 * terza domanda che ci si fa aprendo la riga di qualcuno, cioè «cosa devo
 * dirgli». Sta accanto alle altre due e non sopra, perché è dello stesso
 * ordine: tre domande sulla stessa persona, non una conclusione che vale più
 * degli elenchi da cui viene.
 *
 * **La schermata dice sempre su cosa poggia quello che si sta leggendo.**
 * Quante prove sono entrate, fino a quando, e le medie di allora. Un testo
 * scritto da una macchina sul modo di lavorare di una persona, senza accanto
 * cosa ha letto per scriverlo, è un'opinione con l'aria di un verdetto, e chi
 * lo porta in un colloquio deve poter rispondere a «da dove lo hai preso».
 *
 * I numeri sono quelli del momento in cui è stato scritto e non quelli di
 * adesso, per la stessa ragione per cui una revisione conserva il voto che il
 * docente aveva davanti: una media che cambia sotto un testo che non l'ha mai
 * vista è il modo in cui i due si mettono a dire cose diverse. Che nel
 * frattempo siano arrivate prove nuove lo dice `is_stale`, e lo dice in
 * chiaro invece di aggiornarsi da solo. */

import { useUserDebriefing, useGenerateDebriefing } from '../hooks/useDebriefing'
import type { UserDebriefing } from '../services/admin'
import FormError from './FormError'
import LoadingState from './LoadingState'
import PrimaryButton from './PrimaryButton'
import Tooltip from './Tooltip'
import { formatDateTime } from './lastAccess'
import { formatScore, scoreBadgeTone } from './simulationFormat'

/* Quante prove servono al server per accettare di scriverlo. Ripetuto qui
 * solo per dirlo prima di far partire una richiesta che verrebbe rifiutata,
 * come la coppia voto/motivazione della revisione: la regola che vale resta
 * quella del server, che risponde 409 con il conto esatto. */
const MIN_EVIDENCE = 3

const cardCls = 'rounded-xl border border-white/6 bg-white/3 p-4'

/** Su cosa poggia il quadro: le prove lette e le medie di allora. */
function Coverage({ debriefing }: { debriefing: UserDebriefing }) {
  const { covered_conversations, covered_attempts, conversation_average, attempt_average } =
    debriefing
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
      <span>
        Letto su <strong className="text-slate-200">{covered_conversations}</strong>{' '}
        {covered_conversations === 1 ? 'conversazione' : 'conversazioni'} e{' '}
        <strong className="text-slate-200">{covered_attempts}</strong>{' '}
        {covered_attempts === 1 ? 'test tecnico' : 'test tecnici'}, fino al{' '}
        {formatDateTime(debriefing.covered_until)}
      </span>
      {conversation_average !== null && (
        <span className="flex items-center gap-1.5">
          Media conversazioni
          <span
            className={`rounded-full px-2 py-0.5 text-[0.8rem] font-semibold ${scoreBadgeTone(conversation_average)}`}
          >
            {formatScore(conversation_average)}
          </span>
        </span>
      )}
      {attempt_average !== null && (
        <span className="flex items-center gap-1.5">
          Media test
          <span
            className={`rounded-full px-2 py-0.5 text-[0.8rem] font-semibold ${scoreBadgeTone(attempt_average)}`}
          >
            {formatScore(attempt_average)}
          </span>
        </span>
      )}
    </div>
  )
}

/* Le medie per criterio, dal più basso: è l'ordine in cui si guardano, perché
 * quello che si cerca è dove la persona perde punti. Le sei etichette
 * arrivano dal server insieme ai numeri e non da una copia scritta qui: sono
 * le stesse della valutazione, e due elenchi si allontanerebbero al primo
 * criterio che cambia nome. */
function CriteriaAverages({ debriefing }: { debriefing: UserDebriefing }) {
  if (debriefing.criteria_averages.length === 0) return null
  const sorted = [...debriefing.criteria_averages].sort((a, b) => a.average - b.average)
  return (
    <div className={cardCls}>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
        Media per criterio, sulle prove lette
      </h4>
      <ul className="flex list-none flex-col gap-1.5">
        {sorted.map((criterion) => (
          <li key={criterion.key} className="flex items-center justify-between gap-4">
            <span className="text-[0.85rem] text-slate-300">{criterion.label}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[0.8rem] font-semibold ${scoreBadgeTone(criterion.average)}`}
            >
              {formatScore(criterion.average)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Un tema ricorrente: cosa torna, e su quali prove è stato visto. */
function Theme({ title, detail, evidence }: { title: string; detail: string; evidence: string }) {
  return (
    <li className={`${cardCls} border-l-2 border-l-violet-600/50`}>
      <h4 className="text-[0.9rem] font-semibold text-slate-100">{title}</h4>
      {detail && <p className="mt-1.5 text-[0.85rem] leading-relaxed text-slate-300">{detail}</p>}
      {/* Le prove su cui poggia stanno sotto e in piccolo: si leggono quando
       * si è deciso di credere al tema, non prima. */}
      {evidence && <p className="mt-2 text-xs italic text-slate-500">Visto su: {evidence}</p>}
    </li>
  )
}

export default function UserDebriefingPanel({
  userId,
  userName,
  evidenceCount,
}: {
  userId: string
  /* Il nome serve solo alla frase che spiega cosa si sta per far scrivere:
   * la richiesta viaggia sull'id. */
  userName: string
  /* Quante prove ha questa persona nel periodo che la pagina sta guardando,
   * per non offrire un bottone che il server rifiuterebbe. */
  evidenceCount: number
}) {
  const { data: debriefing, isPending, error } = useUserDebriefing(userId)
  const generate = useGenerateDebriefing(userId)

  if (isPending) {
    return <LoadingState message="Caricamento del quadro d'insieme..." variant="modal" />
  }

  const loadError = error instanceof Error ? error.message : error ? 'Lettura non riuscita.' : ''
  const generateError = generate.error
    ? generate.error instanceof Error
      ? generate.error.message
      : 'Generazione non riuscita.'
    : ''

  /* Sotto la soglia il bottone non c'è, e al suo posto c'è il motivo. Un
   * bottone spento senza spiegazione manda a cercare cosa si è sbagliato. */
  const tooFewProofs = !debriefing && evidenceCount < MIN_EVIDENCE

  return (
    <div className="flex flex-col gap-4">
      {loadError && <FormError message={loadError} />}
      {generateError && <FormError message={generateError} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {debriefing ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[0.95rem] font-semibold text-slate-100">Quadro d'insieme</h3>
                {debriefing.is_stale && (
                  <Tooltip content="Questa persona ha svolto altre prove dopo che il quadro è stato scritto: quello che leggi non le ha viste.">
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-widest text-amber-400">
                      Da aggiornare
                    </span>
                  </Tooltip>
                )}
              </div>
              <span className="text-xs text-slate-500">
                Scritto il {formatDateTime(debriefing.updated_at)}, richiesto da{' '}
                {debriefing.requested_by}
              </span>
            </>
          ) : (
            <>
              <h3 className="text-[0.95rem] font-semibold text-slate-100">Quadro d'insieme</h3>
              <span className="text-xs text-slate-500">
                Gli elementi ricorrenti nelle prove di {userName}, che una prova alla volta non
                emergono
              </span>
            </>
          )}
        </div>

        {!tooFewProofs && (
          <PrimaryButton
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="shrink-0"
          >
            {generate.isPending
              ? 'Lettura delle prove in corso...'
              : debriefing
                ? 'Rigenera'
                : "Genera il quadro d'insieme"}
          </PrimaryButton>
        )}
      </div>

      {/* L'attesa è la più lunga dell'area di amministrazione dopo la
          generazione di un serbatoio di domande, e dire quanto durerà è
          l'unica cosa che impedisce di premere il bottone una seconda
          volta credendo che non abbia funzionato. */}
      {generate.isPending && (
        <LoadingState
          message="Lettura delle prove di questa persona in corso. L'operazione può richiedere qualche minuto."
          variant="modal"
        />
      )}

      {tooFewProofs && (
        <p className="py-4 text-center text-[0.85rem] italic text-slate-500">
          Servono almeno {MIN_EVIDENCE} prove svolte per un quadro d'insieme. Con un numero
          inferiore riprodurrebbe le valutazioni già disponibili
        </p>
      )}

      {!debriefing && !tooFewProofs && !generate.isPending && (
        <p className="py-4 text-center text-[0.85rem] italic text-slate-500">
          Nessun quadro d'insieme ancora scritto per questa persona
        </p>
      )}

      {debriefing && !generate.isPending && (
        <div className="flex flex-col gap-4">
          <Coverage debriefing={debriefing} />

          <p className="text-[0.9rem] leading-relaxed text-slate-200">{debriefing.summary}</p>

          {debriefing.themes.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Elementi Ricorrenti
              </h4>
              <ul className="flex list-none flex-col gap-2">
                {debriefing.themes.map((theme) => (
                  <Theme key={theme.title} {...theme} />
                ))}
              </ul>
            </div>
          )}

          {/* Il miglioramento manca quando nel materiale non si vedeva: è un
              esito e non un dato che non è arrivato, quindi la sezione non
              compare invece di comparire vuota. */}
          {debriefing.improving && (
            <div className={`${cardCls} border-l-2 border-l-cyan-500/50`}>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Aspetti in Miglioramento
              </h4>
              <p className="mt-1.5 text-[0.85rem] leading-relaxed text-slate-300">
                {debriefing.improving}
              </p>
            </div>
          )}

          <div className={`${cardCls} border-l-2 border-l-violet-600`}>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Intervento Prioritario
            </h4>
            <p className="mt-1.5 text-[0.85rem] leading-relaxed text-slate-200">
              {debriefing.next_step}
            </p>
          </div>

          <CriteriaAverages debriefing={debriefing} />
        </div>
      )}
    </div>
  )
}
