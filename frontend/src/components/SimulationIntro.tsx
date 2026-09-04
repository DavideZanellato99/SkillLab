import { useMyAttempts } from '../hooks/useSimulations'
import type { Simulation } from '../services/simulations'
import PrimaryButton from './PrimaryButton'
import SimulationAttemptsList from './SimulationAttemptsList'
import SimulationIntroFacts from './SimulationIntroFacts'
import SimulationIntroRules from './SimulationIntroRules'
import Spinner from './Spinner'

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
 * Questo file è il riquadro e il pulsante: i tre riquadri con i numeri del
 * test stanno in SimulationIntroFacts, le regole in SimulationIntroRules,
 * i tentativi già fatti in SimulationAttemptsList. Sono quattro cose che si
 * leggono una dopo l'altra e cambiano per motivi diversi, e tenerle in un
 * file solo voleva dire duecento righe in cui il pulsante finiva in fondo a
 * un elenco di frasi. */

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

  return (
    <>
      <div className="rounded-2xl border border-white/6 bg-gray-900/60 p-6 backdrop-blur-md">
        <h2 className="mb-4 font-heading text-base font-semibold text-slate-100">Come Funziona</h2>
        <SimulationIntroFacts simulation={simulation} />
        <SimulationIntroRules simulation={simulation} />

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
