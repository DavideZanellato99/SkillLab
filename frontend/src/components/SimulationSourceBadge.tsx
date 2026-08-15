import Tooltip from './Tooltip'
import type { SimulationSource } from '../services/simulations'
import { SparkleIcon } from './icons'
import { sourceLabel } from './simulationFormat'

/**
 * Chi ha scritto le domande di un test: un modello, oppure una persona.
 *
 * Sta accanto a `SimulationKindBadge` ovunque compaia una simulazione, e le
 * due targhette dicono cose diverse: là come si risponde, qui da dove vengono
 * le domande. Un 4 preso su domande scritte da un modello e un 4 preso su
 * domande scritte dal proprio responsabile non si contestano allo stesso modo,
 * e chi legge il voto deve poterlo sapere senza aprire niente.
 *
 * **Il colore non distingue le due origini, l'icona sì.** I colori sono già
 * presi: violetto e ciano dicono il tipo di test, verde e ambra lo stato, e
 * una terza coppia di tinte in fila renderebbe illeggibile la riga invece che
 * più informativa. Qui la pastiglia resta neutra in entrambi i casi, con la
 * scintilla dove ha scritto il modello e la persona dove ha scritto qualcuno:
 * è un'informazione di contorno e ne ha l'aspetto.
 *
 * **Solo l'icona, mai la parola**, a differenza della targhetta del tipo: sta
 * sempre accanto a quella, e due pastiglie scritte una di fianco all'altra
 * allungano ogni riga per dire una cosa che l'icona dice da sola. Chi vuole
 * sapere cosa significa ci passa sopra il mouse, e il tooltip non scrive la
 * parola sola ma la frase intera, che è quello che serve davvero sapere.
 *
 * Il tooltip è quello dell'app e non l'attributo `title` del browser: qui è
 * l'unico modo di leggere la targhetta, quindi non può comparire dopo un
 * secondo né farsi tagliare dal bordo di una tabella. La parola resta nel
 * markup per chi legge con uno screen reader, che il mouse non ce l'ha.
 */
export default function SimulationSourceBadge({ source }: { source: SimulationSource }) {
  const isManual = source === 'manual'
  return (
    <Tooltip
      content={
        isManual
          ? 'Domande redatte manualmente da chi ha predisposto il test'
          : 'Domande generate da un modello a partire dal documento aziendale, e verificate da una persona prima della pubblicazione'
      }
    >
      <span className="inline-flex shrink-0 items-center rounded-full border border-white/10 bg-white/4 p-1 text-slate-400">
        {isManual ? (
          /* Una persona: le ha scritte qualcuno */
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        ) : (
          /* Una scintilla: le ha scritte un modello. È la stessa che sta sul
             bottone che propone un percorso, quindi vive in `icons`. */
          <SparkleIcon size={10} />
        )}
        <span className="sr-only">{sourceLabel(source)}</span>
      </span>
    </Tooltip>
  )
}
