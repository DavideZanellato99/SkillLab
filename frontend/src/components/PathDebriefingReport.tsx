/* Il quadro d'insieme di un percorso, aperto per intero.
 *
 * Le tre schermate di questa sezione rispondono a tre domande diverse: com'è
 * fatto il percorso (la scheda), a che punto è ognuno (la tabella degli
 * assegnati), e cosa fare adesso con tutti insieme, che è questa. Nessuna
 * delle altre due può dirlo, perché quello che serve saperlo è quello che si
 * ripete fra persone diverse, e le altre due leggono una riga per volta.
 *
 * **Non nomina nessuno, ed è voluto.** Chi è fermo dove sta nella tabella
 * accanto, derivato dalle prove e senza costare niente. Qui ci sono le tappe
 * e il gruppo: se un nome comparisse, questa schermata sarebbe una seconda
 * versione di quella tabella, scritta da una macchina e più difficile da
 * verificare.
 *
 * **Dice sempre su cosa poggia.** Quante persone, quante prove, fino a
 * quando. Un testo scritto da un modello sul lavoro di un gruppo, senza
 * accanto cosa ha letto per scriverlo, è un'opinione con l'aria di un
 * verdetto, e chi lo porta in aula deve poter rispondere a «da dove viene».
 *
 * I numeri sono quelli del momento in cui è stato scritto e non quelli di
 * adesso, per la stessa ragione per cui una revisione conserva il voto che il
 * docente aveva davanti: una tabella che cambia sotto un testo che non l'ha
 * mai vista è il modo in cui i due si mettono a dire cose diverse. A dire che
 * il tempo è passato c'è la fascia in cima al pannello.
 */

import type { PathDebriefing, PathDebriefingStep } from '../services/training'
import CriteriaAverageList, { debriefingCardCls as cardCls } from './CriteriaAverageList'
import Tooltip from './Tooltip'
import { formatDateTime } from './dateFormat'
import { formatScore, scoreBadgeTone } from './simulationFormat'

const persone = (n: number) => `${n} ${n === 1 ? 'persona' : 'persone'}`

/** Su cosa poggia il quadro: il gruppo, le prove lette e le medie di allora. */
function Coverage({ debriefing }: { debriefing: PathDebriefing }) {
  const { covered_people, covered_conversations, covered_attempts } = debriefing
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
      <span>
        Letto su <strong className="text-slate-200">{persone(covered_people)}</strong>,{' '}
        <strong className="text-slate-200">{covered_conversations}</strong>{' '}
        {covered_conversations === 1 ? 'conversazione' : 'conversazioni'} e{' '}
        <strong className="text-slate-200">{covered_attempts}</strong>{' '}
        {covered_attempts === 1 ? 'test tecnico' : 'test tecnici'}, fino al{' '}
        {formatDateTime(debriefing.covered_until)}
      </span>
      {debriefing.conversation_average !== null && (
        <span className="flex items-center gap-1.5">
          Media conversazioni
          <span
            className={`rounded-full px-2 py-0.5 text-[0.8rem] font-semibold ${scoreBadgeTone(debriefing.conversation_average)}`}
          >
            {formatScore(debriefing.conversation_average)}
          </span>
        </span>
      )}
      {debriefing.attempt_average !== null && (
        <span className="flex items-center gap-1.5">
          Media test
          <span
            className={`rounded-full px-2 py-0.5 text-[0.8rem] font-semibold ${scoreBadgeTone(debriefing.attempt_average)}`}
          >
            {formatScore(debriefing.attempt_average)}
          </span>
        </span>
      )}
    </div>
  )
}

/* Come stava il gruppo quando il quadro è stato scritto. Tre numeri e non un
 * grafico: sono tre, e messi in fila si leggono più in fretta di quanto si
 * legga una legenda. */
function GroupState({ debriefing }: { debriefing: PathDebriefing }) {
  const { covered_people, started, completed, overdue } = debriefing
  return (
    <div className="flex flex-wrap gap-2">
      {[
        { label: 'Hanno cominciato', value: `${started}/${covered_people}` },
        { label: 'Hanno finito', value: `${completed}/${covered_people}` },
        { label: 'In ritardo', value: `${overdue}/${covered_people}` },
      ].map((voce) => (
        <div key={voce.label} className={`${cardCls} flex-1 basis-[140px] text-center`}>
          <p className="text-[1.15rem] font-bold tabular-nums text-slate-100">{voce.value}</p>
          <p className="text-[0.7rem] uppercase tracking-wider text-slate-500">{voce.label}</p>
        </div>
      ))}
    </div>
  )
}

/* La fila delle tappe, con sopra la sola cosa che qui conta di ognuna: quante
 * ci sono arrivate, quante l'hanno chiusa e quante ci sono ferme. Quella dove
 * il gruppo si ferma è marcata, perché è la riga che il testo qui sopra sta
 * spiegando. */
function Steps({ debriefing }: { debriefing: PathDebriefing }) {
  if (debriefing.steps.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        Le Tappe, Viste Dal Gruppo
      </h4>
      <ul className="flex list-none flex-col gap-1.5">
        {debriefing.steps.map((step) => (
          <Step
            key={step.position}
            step={step}
            isBlocker={step.position === debriefing.blocker_position}
          />
        ))}
      </ul>
    </div>
  )
}

function Step({ step, isBlocker }: { step: PathDebriefingStep; isBlocker: boolean }) {
  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2 ${
        isBlocker ? 'border-amber-500/40 bg-amber-500/8' : 'border-white/6 bg-white/3'
      }`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/10 text-[0.68rem] font-bold tabular-nums text-violet-300">
        {step.position}
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.85rem] text-slate-200">{step.label}</span>
      <span className="flex shrink-0 items-center gap-3 text-[0.75rem] tabular-nums text-slate-400">
        <Tooltip content="Quante persone hanno superato la tappa, fra quelle a cui si era aperta">
          <span>
            {step.passed}/{step.unlocked} superata
          </span>
        </Tooltip>
        {step.stuck > 0 && (
          <Tooltip content="Quante persone hanno qui la propria tappa di adesso">
            <span className={isBlocker ? 'text-amber-300' : ''}>{step.stuck} ferme</span>
          </Tooltip>
        )}
        {step.best_average !== null && (
          <Tooltip content="La media dei migliori voti, fra chi su questa tappa ha almeno una prova">
            <span
              className={`rounded-full px-2 py-0.5 font-semibold ${scoreBadgeTone(step.best_average)}`}
            >
              {formatScore(step.best_average)}
            </span>
          </Tooltip>
        )}
      </span>
    </li>
  )
}

/** Un tema ricorrente: cosa torna fra persone diverse, e su quali tappe. */
function Theme({ title, detail, evidence }: { title: string; detail: string; evidence: string }) {
  return (
    <li className={`${cardCls} border-l-2 border-l-violet-600/50`}>
      <h4 className="text-[0.9rem] font-semibold text-slate-100">{title}</h4>
      {detail && <p className="mt-1.5 text-[0.85rem] leading-relaxed text-slate-300">{detail}</p>}
      {evidence && <p className="mt-2 text-xs italic text-slate-500">Visto su: {evidence}</p>}
    </li>
  )
}

export default function PathDebriefingReport({ debriefing }: { debriefing: PathDebriefing }) {
  return (
    <div className="flex flex-col gap-4">
      <Coverage debriefing={debriefing} />

      <p className="text-[0.9rem] leading-relaxed text-slate-200">{debriefing.summary}</p>

      <GroupState debriefing={debriefing} />

      {/* Dove il percorso si inceppa sta sopra ai temi: è la domanda con cui
          si apre questa schermata, e la tappa la sceglie il conteggio, non il
          modello, che ne spiega solo il perché. Manca quando non è ferma
          nessuna persona, che è un esito e non un dato mancante. */}
      {debriefing.blocker_position !== null && debriefing.blocker && (
        <div className={`${cardCls} border-l-2 border-l-amber-500`}>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Il gruppo si ferma alla tappa {debriefing.blocker_position}
          </h4>
          <p className="mt-1.5 text-[0.85rem] leading-relaxed text-slate-300">
            {debriefing.blocker}
          </p>
        </div>
      )}

      <Steps debriefing={debriefing} />

      {debriefing.themes.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Elementi Ricorrenti Nel Gruppo
          </h4>
          <ul className="flex list-none flex-col gap-2">
            {debriefing.themes.map((theme) => (
              <Theme key={theme.title} {...theme} />
            ))}
          </ul>
        </div>
      )}

      {/* Manca quando nel materiale non si vedeva niente da segnalare: è un
          esito, quindi la sezione non compare invece di comparire vuota. */}
      {debriefing.strength && (
        <div className={`${cardCls} border-l-2 border-l-cyan-500/50`}>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Cosa Il Gruppo Fa Bene
          </h4>
          <p className="mt-1.5 text-[0.85rem] leading-relaxed text-slate-300">
            {debriefing.strength}
          </p>
        </div>
      )}

      <div className={`${cardCls} border-l-2 border-l-violet-600`}>
        <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Cosa Fare Adesso Con Il Gruppo
        </h4>
        <p className="mt-1.5 text-[0.85rem] leading-relaxed text-slate-200">
          {debriefing.next_step}
        </p>
      </div>

      <CriteriaAverageList
        averages={debriefing.criteria_averages}
        title="Media per criterio, sulle conversazioni lette"
      />
    </div>
  )
}
