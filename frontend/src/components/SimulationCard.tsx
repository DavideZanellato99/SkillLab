/* Una tessera del simulatore: il titolo, di cosa è fatto il test e quello che
 * chi guarda ci ha già fatto.
 *
 * È la gemella della tessera di un avatar e le somiglia apposta: si aprono
 * dalla stessa barra, si scorrono con la stessa domanda in testa («cosa
 * provo adesso»), e due griglie che si comportano in modo diverso sono due
 * schermate che vanno imparate due volte. Quello che cambia è il contenuto:
 * un test non ha un ritratto, quindi al posto dell'immagine c'è quello che
 * serve a decidere se cominciarlo adesso.
 *
 * È un link e non un riquadro cliccabile, per la stessa ragione della
 * tessera dell'avatar: il tasto centrale, l'apertura in una scheda nuova e
 * l'indirizzo trascinabile si hanno gratis. */

import { Link } from 'react-router'
import type { Simulation } from '../services/simulations'
import { formatDate } from './dateFormat'
import { staggerDelay } from './galleryLayout'
import { ChecklistIcon, PlayIcon } from './icons'
import { prefetchOnHover } from './lazyPages'
import SimulationKindBadge from './SimulationKindBadge'
import SimulationSourceBadge from './SimulationSourceBadge'

interface SimulationCardProps {
  simulation: Simulation
  /** Il posto nella griglia, per l'ingresso a cascata. */
  index: number
  showOrganization: boolean
}

export default function SimulationCard({
  simulation,
  index,
  showOrganization,
}: SimulationCardProps) {
  const done = simulation.attempt_count > 0
  const times = `${simulation.attempt_count} ${simulation.attempt_count === 1 ? 'svolgimento' : 'svolgimenti'}`

  /* Le distanze sono quelle della tessera dell'avatar, non un `gap` uniforme
   * fra i blocchi: la targhetta stacca di `mb-2`, il titolo di `mb-1` dalla
   * propria descrizione, e in fondo lo storico prende il vuoto che là viene
   * dall'imbottitura del riquadro di testo. Con un `gap` solo, nome e
   * descrizione stavano lontani il triplo che sulla tessera accanto. */
  return (
    <Link
      to={`/app/simulatore/${simulation.id}`}
      className="group relative flex animate-slide-in-bottom flex-col overflow-hidden rounded-3xl border border-white/6 bg-gray-900/60 p-6 no-underline backdrop-blur-xl transition hover:-translate-y-1.5 hover:scale-[1.02] hover:border-white/12 hover:bg-slate-800/70 hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)] active:scale-[0.99]"
      style={{ animationDelay: staggerDelay(index) }}
      id={`simulation-card-${simulation.id}`}
      /* Lo svolgimento del test arriva su richiesta, e questa tessera è la
         porta: il file parte al passaggio del puntatore, mentre si legge di
         che test si tratta (vedi `lazyPages`). */
      {...prefetchOnHover(`/app/simulatore/${simulation.id}`)}
    >
      {/* Il tipo si legge prima di entrare, e sta in cima come la categoria
          sulla tessera dell'avatar: scegliere fra delle alternative in trenta
          secondi e scrivere dieci risposte sono due impegni molto diversi, e
          chi scorre la griglia sta decidendo se cominciare adesso. È la
          targhetta che il tipo ha in tutto il resto dell'app
          (`SimulationKindBadge`), colore compreso, invece della parola in
          grigio che era scritta qui: la stessa cosa si riconosceva in due
          modi a seconda della schermata. Accanto sta da dove vengono le
          domande, che non cambia l'impegno ma cambia cosa si ha davanti.

          Nessun voto: la tessera dice cos'è il test e cosa ci si è già fatto,
          non com'era andata. Un numero colorato in un angolo era la cosa più
          forte della scheda e chiedeva di essere letto per primo, mentre chi
          scorre la griglia sta scegliendo cosa provare adesso; il voto è
          dentro, dove si guarda una prova sola. */}
      <div className="mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <SimulationKindBadge kind={simulation.kind} />
          <SimulationSourceBadge source={simulation.source} />
        </div>
        {/* Di chi è il test, per il solo super admin: su una riga sua e non
            in fila con le targhette, che sono due pastiglie corte e in mezzo
            a loro un nome lungo si portava via la riga intera. */}
        {showOrganization && (
          <p className="mt-1.5 truncate text-xs text-slate-500">{simulation.organization_name}</p>
        )}
      </div>
      <h2 className="mb-1 font-heading text-[1.05rem] font-semibold text-slate-100">
        {simulation.title}
      </h2>
      {simulation.description && (
        <p className="line-clamp-3 text-[0.85rem] leading-relaxed text-slate-400">
          {simulation.description}
        </p>
      )}
      {/* Quante domande sono sta attaccato alla descrizione perché è l'ultima
          cosa che descrive il test: le targhette dicono come si risponde,
          questa dice quanto dura. Lo storico è un'altra cosa, riguarda chi
          guarda e non il test, e per quello sta in fondo, staccato. */}
      <p className="mt-2 text-xs text-slate-500">{simulation.question_count} domande</p>
      {/* Quanti svolgimenti, e quando è stato l'ultimo: è quello che dalla
          griglia serve sapere, cioè se un test è da ripassare o è appena
          stato fatto. Com'era andata lo dice il tentativo, che si apre da
          dentro. La riga è scritta come quella della tessera dell'avatar, che
          porta lo stesso storico e si legge a un clic di distanza: stesso
          conteggio, stessa data per esteso, stessa icona davanti e niente
          tooltip sopra, come là. Del momento esatto qui non se ne fa niente,
          e una riga che reagisce al mouse invita a premerla mentre l'unica
          cosa da premere è la tessera intera. L'icona è quella con cui il
          simulatore si presenta nella barra, come la tessera dell'avatar
          porta quella della chat.

          Nessuna riga a separarla da quello che sta sopra: sulla tessera
          dell'avatar lo stesso storico è staccato dal vuoto e basta, e un
          filo grigio in mezzo faceva sembrare due tessere diverse due
          schermate diverse. */}
      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pb-1 pt-6 text-xs text-slate-500">
        <ChecklistIcon size={13} className="shrink-0" />
        {!done ? (
          <span>Mai svolto</span>
        ) : simulation.last_attempt_at ? (
          <span>
            {times}, ultimo il {formatDate(simulation.last_attempt_at)}
          </span>
        ) : (
          <span>{times}</span>
        )}
      </div>

      <div className="flex items-center justify-end pt-2">
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/6 bg-white/4 px-4 py-1 text-[0.8rem] font-medium text-slate-500 transition group-hover:scale-105 group-hover:border-violet-600 group-hover:bg-violet-600/15 group-hover:text-violet-400">
          <PlayIcon size={14} />
          {done ? 'Riprova' : 'Inizia'}
        </span>
      </div>
    </Link>
  )
}
