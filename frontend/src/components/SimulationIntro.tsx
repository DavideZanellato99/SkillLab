import { useMyAttempts } from '../hooks/useSimulations'
import type { Simulation } from '../services/simulations'
import PrimaryButton from './PrimaryButton'
import SimulationAttemptsList from './SimulationAttemptsList'
import Spinner from './Spinner'
import { isTimed, kindHint, QUESTION_SECONDS, STEP_SECONDS } from './simulationFormat'

/* Quello che si legge prima di cominciare: le regole del test e i propri
 * tentativi passati.
 *
 * Esiste per il cronometro. Con le domande tutte in pagina si poteva entrare,
 * guardare e decidere dopo; ora il tempo della prima domanda parte da solo, e
 * farlo partire su una pagina appena aperta sarebbe rubare secondi a chi sta
 * ancora leggendo il titolo. Qui il test comincia quando lo si dice.
 *
 * Da quando le domande si estraggono a caso, il pulsante è anche il momento
 * in cui il test viene composto: si aspetta il server per un istante, e per
 * quell'istante il pulsante lo dice invece di restare fermo.
 *
 * Le regole sono scritte prima e non scoperte durante: che non si torni
 * indietro e che il tempo scaduto valga come sbagliata cambia il modo di
 * rispondere, quindi si sanno alla prima domanda e non alla terza.
 *
 * I quattro tipi di test hanno regole diverse e questa pagina le dice
 * diverse. Il cronometro ce l'ha solo la scelta multipla: chi se lo
 * aspettasse altrove risponderebbe di corsa senza motivo. E su tre tipi su
 * quattro una risposta può essere giusta a metà, che è la cosa che va detta
 * prima: chi si aspettasse un giudizio secco non capirebbe uno 0,6. */

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[0.9rem] leading-relaxed text-slate-300">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" aria-hidden />
      <span>{children}</span>
    </li>
  )
}

export default function SimulationIntro({
  simulation,
  onStart,
  starting = false,
}: {
  simulation: Simulation
  onStart: () => void
  /** Le domande si stanno estraendo: il test è cominciato ma non è a schermo. */
  starting?: boolean
}) {
  /* Serve solo a scegliere la parola sul pulsante: l'elenco dei tentativi lo
   * carica il componente che li disegna, dalla stessa chiamata in cache. */
  const { data: attempts = [] } = useMyAttempts(simulation.id)

  const total = simulation.question_count
  const kind = simulation.kind
  const isOpen = kind === 'open'
  const timed = isTimed(kind)
  const isManual = simulation.source === 'manual'
  /* Cosa si legge nell'esito, che dipende dal tipo: è la riga in fondo alle
   * regole, quella che dice cosa si porta a casa. */
  const recap: Record<typeof kind, string> = {
    multiple: 'le risposte corrette e quelle fornite',
    open: 'gli elementi attesi nella risposta e quelli mancanti',
    ordering: 'la sequenza corretta accanto a quella indicata',
    matching: 'le associazioni corrette accanto a quelle indicate',
  }

  return (
    <>
      <div className="rounded-2xl border border-white/6 bg-gray-900/60 p-6 backdrop-blur-md">
        <h2 className="mb-4 font-heading text-base font-semibold text-slate-100">Come Funziona</h2>
        <ul className="flex list-none flex-col gap-2.5">
          <Rule>
            {total} domande, presentate una alla volta: la domanda successiva compare dopo la
            conferma della precedente. {kindHint(kind)}.
          </Rule>
          {!timed && (
            <Rule>
              Non è previsto un limite di tempo.{' '}
              {isOpen
                ? 'Formula la risposta con parole tue e rileggila prima di procedere: la durata non incide sul punteggio.'
                : 'Verifica la disposizione prima di procedere: la durata non incide sul punteggio.'}
            </Rule>
          )}
          {isOpen ? (
            <Rule>
              <span className="text-slate-100">
                Il punteggio dipende dalla completezza della risposta.
              </span>{' '}
              Ogni domanda vale fino a un punto e viene valutata in proporzione agli elementi
              effettivamente indicati. Una risposta non fornita vale zero.
            </Rule>
          ) : kind === 'ordering' ? (
            <Rule>
              <span className="text-slate-100">
                Il punteggio dipende dai passi collocati al posto giusto.
              </span>{' '}
              Ogni domanda vale fino a un punto: quattro passi su cinque nella posizione corretta
              valgono otto decimi. Una domanda non affrontata vale zero.
            </Rule>
          ) : kind === 'matching' ? (
            <Rule>
              <span className="text-slate-100">
                Il punteggio dipende dalle associazioni corrette.
              </span>{' '}
              Ogni domanda vale fino a un punto: quattro associazioni su cinque valgono otto decimi.
              Le voci lasciate senza abbinamento valgono zero.
            </Rule>
          ) : (
            <>
              <Rule>
                Ogni domanda ha un tempo massimo di {QUESTION_SECONDS} secondi. Allo scadere viene
                registrata la risposta selezionata, oppure una risposta in bianco se non è stata
                effettuata alcuna scelta.
              </Rule>
              <Rule>
                <span className="text-slate-100">Il punteggio tiene conto anche del tempo.</span>{' '}
                Una risposta corretta vale un punto se immediata, con una riduzione di un decimo
                ogni {STEP_SECONDS} secondi, fino a un minimo di 0,1. Una risposta errata vale zero
                in ogni caso.
              </Rule>
            </>
          )}
          <Rule>
            Non è possibile tornare a una domanda già confermata, e una risposta in bianco equivale
            a una risposta errata.
          </Rule>
          <Rule>
            <span className="text-slate-100">Le domande cambiano a ogni tentativo.</span> Vengono
            estratte in modo casuale all'avvio del test, quindi ripeterlo non comporta la
            ripresentazione delle stesse domande.
          </Rule>
          {/* Da dove vengono le domande, che non cambia come si risponde ma
              cambia cosa si ha davanti: una spiegazione che rimanda al
              documento aziendale, o quella scritta da chi ha preparato il
              test. */}
          <Rule>
            {isManual
              ? 'Le domande e le relative spiegazioni sono state redatte da chi predispone i test.'
              : 'Le domande sono state ricavate da un documento aziendale, e verificate da una persona prima della pubblicazione.'}
          </Rule>
          <Rule>
            L'esito viene mostrato al termine: il riepilogo riporta {recap[kind]} e{' '}
            {isManual ? 'la spiegazione di ogni domanda' : 'gli estratti del documento'}, domanda
            per domanda.
          </Rule>
        </ul>

        <div className="mt-6 border-t border-white/6 pt-5">
          <PrimaryButton onClick={onStart} disabled={starting}>
            {starting ? (
              <>
                <Spinner variant="button" />
                Preparazione del test...
              </>
            ) : attempts.length > 0 ? (
              'Riprova il Test'
            ) : (
              'Inizia il Test'
            )}
          </PrimaryButton>
        </div>
      </div>

      <SimulationAttemptsList simulationId={simulation.id} />
    </>
  )
}
