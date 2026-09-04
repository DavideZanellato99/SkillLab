/* Lo storico dei quadri d'insieme, in righe da una riga.
 *
 * Compare solo dalla seconda volta in poi, e non è un archivio: è il modo in
 * cui si verifica quello che il quadro di adesso afferma. Se in cima c'è
 * scritto "in miglioramento", la domanda immediata è rispetto a cosa, e la
 * risposta è la riga sotto, che si apre e si legge com'è stata scritta.
 *
 * Ogni riga porta le tre cose che servono a scegliere quale aprire: quando è
 * stato scritto, dove diceva che si stava andando, e la media di allora con lo
 * scarto da quella prima. Il testo no: sono mezze pagine, e cinque mezze
 * pagine aperte una sotto l'altra sono il modo di non leggerne nessuna.
 *
 * Le righe arrivano già ridotte all'essenziale, e non è pigrizia: lo stesso
 * elenco serve allo storico di una persona e a quello di un percorso, che
 * sono due tipi diversi con le stesse cinque cose dentro. Un componente per
 * ciascuno vorrebbe dire due elenchi che col tempo si disegnano diversi, e
 * chi passa dall'uno all'altro non riconoscerebbe più cosa sta guardando.
 */

import type { DebriefingDirection } from '../services/admin'
import { directionStyle } from './debriefingFormat'
import { formatDateTime } from './dateFormat'
import { Delta } from './scoreCharts'
import { formatScore } from './simulationFormat'

/** Una versione, ridotta a quello che la riga mostra. */
export interface DebriefingVersionRow {
  id: string
  createdAt: string
  /** Assente sul primo quadro, e sul quadro di un percorso anche quando il
   *  gruppo è cambiato: là un confronto non esiste. */
  direction: DebriefingDirection | null
  average: number | null
  delta: number | null
}

function Row({
  version,
  isCurrent,
  isLatest,
  onSelect,
}: {
  version: DebriefingVersionRow
  /** È quello aperto qui sopra. */
  isCurrent: boolean
  /** È il più recente, cioè quello che vale adesso. */
  isLatest: boolean
  onSelect: () => void
}) {
  const style = directionStyle(version.direction)
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={isCurrent}
        className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2 text-left transition-colors ${
          isCurrent
            ? 'border-violet-600/40 bg-violet-600/10'
            : 'border-white/6 bg-white/3 hover:border-white/12 hover:bg-white/6'
        }`}
      >
        <span className="text-[0.82rem] text-slate-200">{formatDateTime(version.createdAt)}</span>
        {isLatest && (
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-slate-400">
            Attuale
          </span>
        )}
        {style && (
          <span
            className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider ${style.tone}`}
          >
            {style.label}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {version.average !== null && (
            <span className="text-[0.78rem] tabular-nums text-slate-400">
              Media {formatScore(version.average)}
            </span>
          )}
          {version.delta !== null && <Delta value={version.delta} />}
        </span>
      </button>
    </li>
  )
}

export default function DebriefingHistory({
  versions,
  currentId,
  onSelect,
}: {
  /** Tutte le versioni, dalla più recente. */
  versions: DebriefingVersionRow[]
  /** Quale è aperta qui sopra. */
  currentId: string
  onSelect: (id: string) => void
}) {
  /* Con una sola versione non c'è nessuno storico da sfogliare, e un elenco
   * di un elemento che ripete quello che si sta già leggendo sarebbe un
   * comando che non porta da nessuna parte. */
  if (versions.length < 2) return null

  return (
    <div className="flex flex-col gap-2 border-t border-white/6 pt-4">
      <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        Quadri Precedenti
      </h4>
      <ul className="flex list-none flex-col gap-1.5">
        {versions.map((version, index) => (
          <Row
            key={version.id}
            version={version}
            isCurrent={version.id === currentId}
            isLatest={index === 0}
            onSelect={() => onSelect(version.id)}
          />
        ))}
      </ul>
    </div>
  )
}
