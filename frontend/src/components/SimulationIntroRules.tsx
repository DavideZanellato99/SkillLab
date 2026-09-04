import type { ReactNode } from 'react'
import type { Simulation, SimulationKind } from '../services/simulations'
import {
  ChartIcon,
  CheckIcon,
  ChecklistIcon,
  ClockIcon,
  CompareIcon,
  EyeIcon,
  FileTextIcon,
  LockIcon,
  MinusIcon,
  PencilIcon,
  RestoreIcon,
  SortIcon,
  SparkleIcon,
  StopIcon,
  TargetIcon,
  UserIcon,
} from './icons'
import {
  GRACE_SECONDS,
  isTimed,
  QUESTION_SECONDS,
  spelledClock,
  STEP_SECONDS,
} from './simulationFormat'

/* Le regole del test, in tre gruppi.
 *
 * Erano sette righe di seguito con lo stesso pallino davanti, e sette cose
 * che pesano uguale sono sette cose che si leggono di traverso: chi cerca
 * come viene il voto lo trovava in quinta posizione, fra come si passa alla
 * domanda dopo e da dove vengono le domande. In tre gruppi ogni riga sta con
 * quelle che rispondono alla stessa domanda, e le domande sono tre: come si
 * svolge, come si prende il voto, cosa si legge alla fine.
 *
 * Una riga, una frase. Erano paragrafi da due o tre periodi, e un paragrafo
 * di regole si legge come un testo di legge: la cosa che serviva stava in
 * mezzo, dopo un punto, e per trovarla bisognava leggere anche le altre due.
 * Quando una regola ha due parti sono due righe, e quello che era un secondo
 * periodo diventa il punto elenco che gli sta sotto.
 *
 * L'icona davanti a ogni riga dice di cosa parla prima che la si legga:
 * l'orologio è il tempo, il lucchetto è quello che non si può disfare, le
 * scintille sono le domande scritte dal modello. Sono le stesse icone che
 * hanno lo stesso significato altrove nell'applicazione.
 *
 * I quattro tipi di test hanno regole diverse e questo componente le dice
 * diverse. Il cronometro ce l'ha solo la scelta multipla: chi se lo
 * aspettasse altrove risponderebbe di corsa senza motivo. E su tre tipi su
 * quattro una risposta può essere giusta a metà, che è la cosa che va detta
 * prima: chi si aspettasse un giudizio secco non capirebbe uno 0,6. */

/* Cosa si fa davanti a una domanda, in una riga.
 *
 * È il gemello di `kindHint`, e non lo stesso testo: quello è la coda della
 * descrizione di un test nell'elenco ("Due colonne da accoppiare, una voce
 * alla volta"), qui si parla a chi il test sta per farlo, quindi è una frase
 * intera che dice cosa gli si chiede. */
const ANSWER_HINTS: Record<SimulationKind, string> = {
  multiple: 'Per ogni domanda scegli una risposta fra le alternative proposte.',
  open: 'Per ogni domanda scrivi una risposta di qualche riga con parole tue.',
  ordering: "Per ogni domanda disponi i passi della procedura nell'ordine corretto.",
  matching: 'Per ogni domanda abbini fra loro le voci di due colonne.',
}

/** Cosa si legge nel riepilogo finale, che è la parte che dipende dal tipo. */
const RECAPS: Record<SimulationKind, string> = {
  multiple: 'la risposta corretta accanto a quella che hai fornito',
  open: 'gli elementi attesi nella risposta e quelli che mancano',
  ordering: 'la sequenza corretta accanto a quella che hai indicato',
  matching: 'le associazioni corrette accanto a quelle che hai indicato',
}

/* Il gesto con cui si risponde, disegnato: la spunta della scelta, la matita
 * di chi scrive, le frecce di chi riordina, le due colonne da accoppiare. */
function AnswerIcon({ kind }: { kind: SimulationKind }) {
  if (kind === 'open') return <PencilIcon size={13} />
  if (kind === 'ordering') return <SortIcon size={13} />
  if (kind === 'matching') return <CompareIcon size={13} />
  return <CheckIcon size={13} />
}

function Rule({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-[0.9rem] leading-relaxed text-slate-300">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-violet-600/20 bg-violet-600/10 text-violet-400">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  )
}

function RuleGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </h3>
      <ul className="flex list-none flex-col gap-2.5">{children}</ul>
    </section>
  )
}

export default function SimulationIntroRules({ simulation }: { simulation: Simulation }) {
  const kind = simulation.kind
  const timed = isTimed(kind)
  const isManual = simulation.source === 'manual'

  return (
    <div className="flex flex-col gap-5">
      <RuleGroup title="Svolgimento">
        <Rule icon={<ChecklistIcon size={13} />}>
          Le domande sono {simulation.question_count} e compaiono una alla volta, la successiva dopo
          aver confermato la precedente.
        </Rule>
        <Rule icon={<AnswerIcon kind={kind} />}>{ANSWER_HINTS[kind]}</Rule>
        {timed ? (
          <>
            <Rule icon={<ClockIcon size={13} />}>
              Ogni domanda ha un tempo massimo di {spelledClock(QUESTION_SECONDS)}.
            </Rule>
            <Rule icon={<StopIcon size={13} />}>
              Allo scadere viene registrata la risposta selezionata in quel momento, oppure una
              risposta in bianco se non ne hai scelta nessuna.
            </Rule>
          </>
        ) : (
          <Rule icon={<ClockIcon size={13} />}>
            Non è previsto un limite di tempo e la durata non incide sul punteggio.
          </Rule>
        )}
        <Rule icon={<LockIcon size={13} />}>Una domanda confermata non si può più riaprire.</Rule>
        <Rule icon={<RestoreIcon size={13} />}>
          <span className="text-slate-100">Le domande cambiano a ogni tentativo</span>, perché
          vengono estratte in modo casuale a ogni avvio del test.
        </Rule>
      </RuleGroup>

      <RuleGroup title="Punteggio">
        <Rule icon={<TargetIcon size={13} />}>
          <span className="text-slate-100">
            {kind === 'open'
              ? 'Il punteggio dipende dalla completezza della risposta.'
              : kind === 'ordering'
                ? 'Il punteggio dipende dai passi collocati nella posizione corretta.'
                : kind === 'matching'
                  ? 'Il punteggio dipende dalle associazioni corrette.'
                  : 'Il punteggio tiene conto anche del tempo di risposta.'}
          </span>
        </Rule>
        {timed ? (
          <>
            <Rule icon={<CheckIcon size={13} />}>
              Una risposta corretta entro i primi {spelledClock(GRACE_SECONDS)} vale un punto
              intero.
            </Rule>
            <Rule icon={<ChartIcon size={13} />}>
              Dopo i primi {spelledClock(GRACE_SECONDS)} il valore scende di un decimo ogni{' '}
              {STEP_SECONDS} secondi, fino a un minimo di 0,1 punti.
            </Rule>
          </>
        ) : (
          <Rule icon={<CheckIcon size={13} />}>
            {kind === 'open'
              ? 'Ogni domanda vale fino a un punto, assegnato in proporzione agli elementi attesi che hai indicato.'
              : kind === 'ordering'
                ? 'Ogni domanda vale fino a un punto, quindi quattro passi su cinque al posto giusto valgono otto decimi.'
                : 'Ogni domanda vale fino a un punto, quindi quattro associazioni su cinque valgono otto decimi.'}
          </Rule>
        )}
        <Rule icon={<MinusIcon size={13} />}>
          {kind === 'open'
            ? 'Una risposta non fornita vale zero.'
            : kind === 'ordering'
              ? 'Una domanda non affrontata vale zero.'
              : kind === 'matching'
                ? 'Le voci lasciate senza abbinamento valgono zero.'
                : 'Una risposta errata o lasciata in bianco vale zero.'}
        </Rule>
      </RuleGroup>

      <RuleGroup title="Esito">
        {/* Da dove vengono le domande, che non cambia come si risponde ma
            cambia cosa si ha davanti: una spiegazione che rimanda al
            documento aziendale, o quella scritta da chi ha preparato il
            test. */}
        <Rule icon={isManual ? <UserIcon size={13} /> : <SparkleIcon size={13} />}>
          {isManual
            ? 'Le domande e le relative spiegazioni sono state scritte da chi predispone i test.'
            : 'Le domande sono state ricavate da un documento aziendale e verificate da una persona prima della pubblicazione.'}
        </Rule>
        <Rule icon={<EyeIcon size={13} />}>
          Al termine del test vedi il riepilogo di ogni domanda, con {RECAPS[kind]}.
        </Rule>
        <Rule icon={<FileTextIcon size={13} />}>
          {isManual
            ? 'Nel riepilogo trovi anche la spiegazione di ogni domanda.'
            : 'Nel riepilogo trovi anche gli estratti del documento da cui è stata ricavata ogni domanda.'}
        </Rule>
      </RuleGroup>
    </div>
  )
}
