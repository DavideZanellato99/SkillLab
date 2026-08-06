import { useMyAttempts } from '../hooks/useSimulations'
import type { Simulation } from '../services/simulations'
import PrimaryButton from './PrimaryButton'
import SimulationAttemptsList from './SimulationAttemptsList'
import Spinner from './Spinner'
import { QUESTION_SECONDS, STEP_SECONDS } from './simulationFormat'

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
 * I due tipi di test hanno regole diverse e questa pagina le dice diverse.
 * Su un test a risposta aperta il cronometro non c'è e i punti dipendono da
 * quanto la risposta è completa: chi si aspettasse trenta secondi
 * risponderebbe di corsa senza motivo, e chi si aspettasse un giudizio
 * secco non capirebbe uno 0,6. */

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
  const isOpen = simulation.kind === 'open'
  const isManual = simulation.source === 'manual'

  return (
    <>
      <div className="rounded-2xl border border-white/6 bg-gray-900/60 p-6 backdrop-blur-md">
        <h2 className="mb-4 font-heading text-base font-semibold text-slate-100">Come funziona</h2>
        <ul className="flex list-none flex-col gap-2.5">
          <Rule>
            {total} domande {isOpen ? 'a risposta aperta' : 'a risposta multipla'}, una alla volta:
            la successiva compare quando hai risposto alla precedente.
          </Rule>
          {isOpen ? (
            <>
              <Rule>
                Non c'è tempo limite. Scrivi la risposta con parole tue e rileggila prima di andare
                avanti: quanto ci metti non toglie punti.
              </Rule>
              <Rule>
                <span className="text-slate-100">Conta quanto la risposta è completa.</span> Ogni
                domanda vale fino a un punto, e ne prende una parte se dice solo una parte di quello
                che serviva. Una risposta lasciata in bianco vale zero.
              </Rule>
            </>
          ) : (
            <>
              <Rule>
                Hai {QUESTION_SECONDS} secondi per ogni domanda. Allo scadere si passa avanti con la
                risposta che hai selezionato, o in bianco se non ne hai scelta nessuna.
              </Rule>
              <Rule>
                <span className="text-slate-100">Conta anche quanto ci metti.</span> Una risposta
                giusta vale un punto se arriva subito, e un decimo in meno ogni {STEP_SECONDS}{' '}
                secondi che passano, fino a un minimo di 0,1. Una risposta sbagliata vale zero
                comunque.
              </Rule>
            </>
          )}
          <Rule>
            Non si torna indietro su una domanda già consegnata, e in bianco vale come sbagliata.
          </Rule>
          <Rule>
            <span className="text-slate-100">Le domande cambiano a ogni tentativo.</span> Sono
            estratte a caso quando premi il pulsante, quindi rifare il test non vuol dire rispondere
            di nuovo alle stesse.
          </Rule>
          {/* Da dove vengono le domande, che non cambia come si risponde ma
              cambia cosa si ha davanti: una spiegazione che rimanda al
              documento aziendale, o quella scritta da chi ha preparato il
              test. */}
          <Rule>
            {isManual
              ? 'Le domande e le spiegazioni le ha scritte chi prepara i test.'
              : 'Le domande sono state ricavate da un documento aziendale, e rilette da una persona prima della pubblicazione.'}
          </Rule>
          <Rule>
            Come è andata lo scopri alla fine: il riepilogo mostra{' '}
            {isOpen
              ? 'cosa avrebbe dovuto dire la tua risposta, cosa le è mancato'
              : 'le risposte corrette, le tue'}{' '}
            e {isManual ? 'la spiegazione di ogni domanda' : 'cosa dice il documento'}, domanda per
            domanda.
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
              'Riprova il test'
            ) : (
              'Inizia il test'
            )}
          </PrimaryButton>
        </div>
      </div>

      <SimulationAttemptsList simulationId={simulation.id} />
    </>
  )
}
