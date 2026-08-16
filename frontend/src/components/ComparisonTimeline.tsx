import type { ReactNode } from 'react'
import Tooltip from './Tooltip'
import type { PairRole } from './comparisonFilters'
import { formatDate } from './lastAccess'
import { formatScore, scoreTextColor } from './scoreFormat'

/* Le prove svolte, in fila e in ordine di tempo, da cui si scelgono le due da
 * affiancare.
 *
 * Prima erano due tendine. Per cambiare una delle due prove bisognava aprire
 * un elenco di righe tutte uguali, fatte di data, titolo e voto, e ricordarsi
 * cosa c'era nell'altra tendina mentre si leggeva questa: la coppia che si
 * stava componendo non era mai visibile per intero. Qui le prove si vedono
 * tutte insieme, nell'ordine in cui sono state svolte, che è l'ordine in cui
 * si guarda un miglioramento.
 *
 * Ogni prova porta i due posti del confronto, "prima" e "dopo", e si tocca
 * quello che le si vuole dare. Il posto lo dice chi sceglie: una carta sola da
 * toccare avrebbe avuto bisogno di una regola per decidere quale delle due
 * prove in corso lasciava il posto, e quella regola non si vede, va indovinata
 * al primo tocco e ricordata a ogni tocco successivo. Qui non c'è niente da
 * indovinare: i due comandi accesi sono la coppia, e toccarne un altro la
 * sposta lì.
 *
 * Le stesse due parole del verdetto, delle intestazioni dei criteri e delle
 * card in fondo: chi tocca "prima" sa già dove finirà quella prova. */

export interface TimelineEntry {
  id: string
  /** Quando la prova è stata svolta. */
  when: string
  /** Come si riconosce: il titolo della conversazione o del test. */
  title: string
  score: number
  /** La targhetta della specie: canale per una conversazione, tipo per un test. */
  badge?: ReactNode
}

const ROLES: { role: PairRole; label: string }[] = [
  { role: 'leftId', label: 'Prima' },
  { role: 'rightId', label: 'Dopo' },
]

export default function ComparisonTimeline({
  label,
  entries,
  leftId,
  rightId,
  onAssign,
}: {
  /** Cosa si sta scegliendo: "Conversazioni Valutate", "Test Consegnati". */
  label: string
  entries: TimelineEntry[]
  leftId: string
  rightId: string
  onAssign: (role: PairRole, id: string) => void
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <span className="text-[0.72rem] text-slate-500">
          Assegna a due prove il loro posto nel confronto
        </span>
      </div>

      {/* Con molte prove la fila scorre invece di allungare la pagina: quello
          che conta sta sotto, e la scelta non deve spingerlo fuori schermo. */}
      <div className="flex max-h-[15rem] flex-wrap gap-2 overflow-y-auto pr-1">
        {entries.map((entry) => {
          const chosen = entry.id === leftId || entry.id === rightId
          return (
            <div
              key={entry.id}
              className={`w-[12.5rem] rounded-xl border px-3 py-2 transition max-sm:w-full ${
                chosen ? 'border-violet-500/45 bg-violet-500/10' : 'border-white/6 bg-white/2'
              }`}
            >
              <span className="text-[0.68rem] text-slate-500">{formatDate(entry.when)}</span>
              <Tooltip content={entry.title} truncateOnly>
                <p className="truncate text-[0.8rem] text-slate-200">{entry.title}</p>
              </Tooltip>
              <div className="mt-1.5 flex items-center gap-2">
                <span className={`text-sm font-bold ${scoreTextColor(entry.score)}`}>
                  {formatScore(entry.score)}
                </span>
                {entry.badge}
              </div>

              {/* I due comandi sotto i dati della prova, e non sopra: prima si
                  legge di quale prova si tratta, poi si decide dove metterla.
                  Restano visibili anche senza puntatore, perché su un telefono
                  un comando che compare al passaggio del mouse non compare
                  mai. */}
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-white/6 bg-slate-800/50 p-1">
                {ROLES.map(({ role, label: roleLabel }) => {
                  const isActive = entry.id === (role === 'leftId' ? leftId : rightId)
                  return (
                    <button
                      key={role}
                      type="button"
                      aria-pressed={isActive}
                      aria-label={`${entry.title}, ${formatDate(entry.when)}: metti come ${roleLabel.toLowerCase()}`}
                      onClick={() => onAssign(role, entry.id)}
                      className={`cursor-pointer rounded-md px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-wider transition ${
                        isActive
                          ? 'bg-violet-600/25 text-violet-100 shadow-[inset_0_0_0_1px_rgba(124,58,237,0.45)]'
                          : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                      }`}
                    >
                      {roleLabel}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
