/* Un quadro d'insieme aperto per intero: cosa dice, e su cosa poggia.
 *
 * Sta in un file suo perché lo stesso disegno serve due volte, per l'ultimo
 * quadro e per una versione vecchia riaperta dallo storico: sono la stessa
 * cosa scritta in momenti diversi, e mostrarne una in forma ridotta
 * lascerebbe credere che le versioni vecchie contengano meno.
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
 * vista è il modo in cui i due si mettono a dire cose diverse. Gli scarti
 * accanto alle medie non sono un'eccezione: non ricalcolano niente,
 * sottraggono la fotografia di prima da questa. */

import type { UserDebriefing } from '../services/admin'
import Tooltip from './Tooltip'
import { directionStyle } from './debriefingFormat'
import { formatDateTime } from './lastAccess'
import { Delta } from './scoreCharts'
import { formatScore, scoreBadgeTone } from './simulationFormat'

const cardCls = 'rounded-xl border border-white/6 bg-white/3 p-4'

/** Una media di allora, con accanto di quanto si è mossa. */
function Average({ label, value, delta }: { label: string; value: number; delta: number | null }) {
  return (
    <span className="flex items-center gap-1.5">
      {label}
      <span
        className={`rounded-full px-2 py-0.5 text-[0.8rem] font-semibold ${scoreBadgeTone(value)}`}
      >
        {formatScore(value)}
      </span>
      {delta !== null && (
        <Tooltip content="Rispetto al quadro d'insieme precedente">
          <Delta value={delta} />
        </Tooltip>
      )}
    </span>
  )
}

/** Su cosa poggia il quadro: le prove lette e le medie di allora. */
function Coverage({ debriefing }: { debriefing: UserDebriefing }) {
  const { covered_conversations, covered_attempts } = debriefing
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
      <span>
        Letto su <strong className="text-slate-200">{covered_conversations}</strong>{' '}
        {covered_conversations === 1 ? 'conversazione' : 'conversazioni'} e{' '}
        <strong className="text-slate-200">{covered_attempts}</strong>{' '}
        {covered_attempts === 1 ? 'test tecnico' : 'test tecnici'}, fino al{' '}
        {formatDateTime(debriefing.covered_until)}
      </span>
      {debriefing.conversation_average !== null && (
        <Average
          label="Media conversazioni"
          value={debriefing.conversation_average}
          delta={debriefing.conversation_average_delta}
        />
      )}
      {debriefing.attempt_average !== null && (
        <Average
          label="Media test"
          value={debriefing.attempt_average}
          delta={debriefing.attempt_average_delta}
        />
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
            <span className="flex shrink-0 items-center gap-1.5">
              {criterion.delta !== null && <Delta value={criterion.delta} />}
              <span
                className={`rounded-full px-2 py-0.5 text-[0.8rem] font-semibold ${scoreBadgeTone(criterion.average)}`}
              >
                {formatScore(criterion.average)}
              </span>
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

/* Come la persona si è mossa dal quadro precedente, che è la sola cosa che
 * una fotografia sola non può dire. Sta sopra ai temi e sotto alla sintesi,
 * cioè dove cade l'occhio subito dopo aver letto a che punto è: chi apre
 * questa schermata su qualcuno che conosce già vuole sapere prima di tutto
 * se quello che aveva letto l'ultima volta vale ancora.
 *
 * Non compare sul primo quadro di una persona, e non compare vuota: lì un
 * prima non c'è, e una riga "nessun confronto disponibile" occuperebbe lo
 * spazio della cosa più importante per dire che non c'è. */
function Movement({ debriefing }: { debriefing: UserDebriefing }) {
  const style = directionStyle(debriefing.direction)
  if (!style) return null
  return (
    <div className={`${cardCls} flex flex-col gap-2`}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Rispetto al quadro precedente
        </h4>
        <span
          className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider ${style.tone}`}
        >
          {style.label}
        </span>
      </div>
      {debriefing.change && (
        <p className="text-[0.85rem] leading-relaxed text-slate-300">{debriefing.change}</p>
      )}
    </div>
  )
}

export default function DebriefingVersion({ debriefing }: { debriefing: UserDebriefing }) {
  return (
    <div className="flex flex-col gap-4">
      <Coverage debriefing={debriefing} />

      <p className="text-[0.9rem] leading-relaxed text-slate-200">{debriefing.summary}</p>

      <Movement debriefing={debriefing} />

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
  )
}
