import { useMemo, useState } from 'react'
import type { SimulationReportRow } from '../services/admin'
import DataTable, { Td, Tr } from './DataTable'
import Tooltip from './Tooltip'
import SimulationAttemptModal from './SimulationAttemptModal'
import { matchesSearch } from './tableSearch'
import { KpiCard, MeterRow, TrendChart } from './scoreCharts'
import {
  cardCls,
  dailyAverages,
  formatDateTime,
  formatScore,
  personName,
  scoreTextColor,
} from './scoreFormat'

/* La metà scritta della dashboard: come vanno i test tecnici.
 *
 * Stesso stampo delle conversazioni, e non per simmetria: chi guarda sta
 * facendo la stessa domanda (chi è messo bene, chi arranca, cosa non è
 * passato) su una prova diversa, quindi trova le risposte nello stesso
 * ordine e negli stessi disegni. Cambia cosa sta sull'asse: là i criteri di
 * una valutazione, qui le simulazioni svolte.
 *
 * Il filtro utente e quello per organizzazione sono quelli della pagina: le
 * due sezioni guardano sempre le stesse persone. */

const TENTATIVI: [string, string] = ['tentativo', 'tentativi']

/** Quante volte, scritto come si legge: "1 tentativo", "4 tentativi". */
const conteggio = (n: number) => `${n} ${n === 1 ? TENTATIVI[0] : TENTATIVI[1]}`

interface SimulationAvg {
  simulationId: string
  title: string
  avg: number
  count: number
}

interface UserAvg {
  userId: string
  name: string
  email: string
  avg: number
  count: number
}

export default function DashboardSimulations({
  rows,
  selectedUserId,
}: {
  rows: SimulationReportRow[]
  /** Vuoto quando la pagina non sta filtrando su nessuno. */
  selectedUserId: string
}) {
  const [search, setSearch] = useState('')
  /* Il tentativo aperto dal clic su una riga. Tiene l'id e non la riga
   * perché le risposte non stanno nel report: le carica la modale. */
  const [openAttemptId, setOpenAttemptId] = useState<string | null>(null)

  const filtered = useMemo(
    () => (selectedUserId ? rows.filter((r) => r.user_id === selectedUserId) : rows),
    [rows, selectedUserId],
  )

  const overallAvg = useMemo(
    () =>
      filtered.length ? filtered.reduce((sum, r) => sum + r.score, 0) / filtered.length : null,
    [filtered],
  )

  /* Percentuale di risposte esatte, contata sulle domande e non sulla media
   * dei voti: un test da tre domande e uno da dieci pesano per quanto
   * chiedono, che è il senso della domanda "quanto sanno". */
  const correctRate = useMemo(() => {
    const asked = filtered.reduce((sum, r) => sum + r.question_count, 0)
    if (!asked) return null
    return (filtered.reduce((sum, r) => sum + r.correct_count, 0) / asked) * 100
  }, [filtered])

  const simulationsTaken = useMemo(
    () => new Set(filtered.map((r) => r.simulation_id)).size,
    [filtered],
  )

  const trendPoints = useMemo(
    () =>
      dailyAverages(
        filtered,
        (r) => r.attempted_at,
        (r) => r.score,
      ),
    [filtered],
  )

  /* Media per simulazione: dice quale test la gente non passa, ed è la sola
   * riga che parla del test invece che di chi lo svolge. */
  const simulationAvgs = useMemo<SimulationAvg[]>(() => {
    const acc = new Map<string, SimulationAvg & { sum: number }>()
    for (const r of filtered) {
      const entry = acc.get(r.simulation_id) ?? {
        simulationId: r.simulation_id,
        title: r.simulation_title,
        avg: 0,
        count: 0,
        sum: 0,
      }
      entry.sum += r.score
      entry.count += 1
      acc.set(r.simulation_id, entry)
    }
    return Array.from(acc.values())
      .map((e) => ({ ...e, avg: e.sum / e.count }))
      .sort((a, b) => a.avg - b.avg)
  }, [filtered])

  /* Confronto fra utenti: sempre su tutti, il filtro utente evidenzia soltanto */
  const userAvgs = useMemo<UserAvg[]>(() => {
    const acc = new Map<string, UserAvg & { sum: number }>()
    for (const r of rows) {
      const entry = acc.get(r.user_id) ?? {
        userId: r.user_id,
        name: personName(r),
        email: r.user_email,
        avg: 0,
        count: 0,
        sum: 0,
      }
      entry.sum += r.score
      entry.count += 1
      acc.set(r.user_id, entry)
    }
    return Array.from(acc.values())
      .map((e) => ({ ...e, avg: e.sum / e.count }))
      .sort((a, b) => b.avg - a.avg)
  }, [rows])

  const detailRows = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => new Date(b.attempted_at).getTime() - new Date(a.attempted_at).getTime(),
      ),
    [filtered],
  )

  const searchedRows = useMemo(
    () =>
      detailRows.filter((r) =>
        matchesSearch(
          search,
          r.simulation_title,
          personName(r),
          r.user_email,
          formatDateTime(r.attempted_at),
        ),
      ),
    [detailRows, search],
  )

  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/6 bg-slate-800/40 px-6 py-4 text-sm text-slate-400">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-slate-500"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>
          Nessun test tecnico ancora consegnato. I grafici appariranno quando le simulazioni
          pubblicate verranno svolte
        </span>
      </div>
    )
  }

  return (
    <>
      {/* KPI */}
      <div className="mb-6 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <KpiCard label="Voto medio dei test">
          <p className="font-heading text-4xl font-bold text-slate-100">
            {overallAvg !== null ? (
              <>
                <span className={scoreTextColor(overallAvg)}>{formatScore(overallAvg)}</span>
                <span className="text-lg font-medium text-slate-500"> /10</span>
              </>
            ) : (
              '—'
            )}
          </p>
        </KpiCard>
        <KpiCard label="Test consegnati">
          <p className="font-heading text-4xl font-bold text-slate-100">{filtered.length}</p>
        </KpiCard>
        <KpiCard label="Simulazioni svolte">
          <p className="font-heading text-4xl font-bold text-slate-100">{simulationsTaken}</p>
        </KpiCard>
        <KpiCard label="Risposte esatte">
          <p className="font-heading text-4xl font-bold text-slate-100">
            {correctRate !== null ? (
              <>
                {Math.round(correctRate)}
                <span className="text-lg font-medium text-slate-500">%</span>
              </>
            ) : (
              '—'
            )}
          </p>
        </KpiCard>
      </div>

      {/* Andamento nel tempo */}
      <div className={`${cardCls} mb-6`}>
        <h3 className="text-sm font-semibold text-slate-300">Andamento nel tempo</h3>
        <p className="mb-4 text-xs text-slate-500">
          Media giornaliera dei voti dei test consegnati
          {selectedUserId ? ', per l’utente selezionato' : ''}
        </p>
        {trendPoints.length > 0 ? (
          <TrendChart points={trendPoints} unit={TENTATIVI} />
        ) : (
          <p className="py-10 text-center text-sm italic text-slate-500">
            Nessun test per la selezione corrente.
          </p>
        )}
      </div>

      {/* Media per simulazione */}
      <div className={`${cardCls} mb-6`}>
        <h3 className="text-sm font-semibold text-slate-300">Media per simulazione</h3>
        <p className="mb-4 text-xs text-slate-500">
          Voto medio di ogni test, dal più ostico al più riuscito
        </p>
        <div className="flex flex-col gap-2.5">
          {simulationAvgs.map((s) => (
            <MeterRow
              key={s.simulationId}
              label={s.title}
              sub={conteggio(s.count)}
              score={s.avg}
              fullLabel
            />
          ))}
        </div>
      </div>

      {/* Confronto tra utenti */}
      <div className={`${cardCls} mb-6`}>
        <h3 className="text-sm font-semibold text-slate-300">Confronto tra utenti</h3>
        <p className="mb-4 text-xs text-slate-500">
          Voto medio per utente, su tutti i test che ha consegnato
        </p>
        <div className="flex flex-col gap-1.5">
          {userAvgs.map((u) => (
            <MeterRow
              key={u.userId}
              label={u.name}
              sub={conteggio(u.count)}
              score={u.avg}
              dimmed={selectedUserId !== '' && u.userId !== selectedUserId}
              highlighted={selectedUserId !== '' && u.userId === selectedUserId}
            />
          ))}
        </div>
      </div>

      {/* Vista tabellare */}
      <DataTable
        columns={[
          { key: 'simulazione', label: 'Simulazione' },
          { key: 'data', label: 'Data' },
          { key: 'utente', label: 'Utente' },
          { key: 'corrette', label: 'Corrette', align: 'center', compact: true },
          { key: 'voto', label: 'Voto', align: 'right' },
        ]}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cerca per simulazione o utente..."
        isEmpty={searchedRows.length === 0}
        emptyMessage={
          search
            ? 'Nessun test corrisponde alla ricerca.'
            : 'Nessun test per la selezione corrente.'
        }
      >
        {searchedRows.map((r) => (
          <Tooltip key={r.attempt_id} content="Vedi il test svolto" anchor="cursor">
            <Tr className="cursor-pointer" onClick={() => setOpenAttemptId(r.attempt_id)}>
              <Td>
                <span className="text-[0.85rem] font-medium text-slate-100">
                  {r.simulation_title}
                </span>
              </Td>
              <Td className="text-[0.82rem] text-slate-400">{formatDateTime(r.attempted_at)}</Td>
              <Td>
                <span className="text-[0.85rem] font-medium text-slate-100">{personName(r)}</span>
                <span className="block truncate text-[0.7rem] text-slate-500">{r.user_email}</span>
              </Td>
              <Td align="center" compact className="text-[0.82rem] tabular-nums text-slate-400">
                {r.correct_count}/{r.question_count}
              </Td>
              <Td align="right">
                <span className={`text-sm font-bold tabular-nums ${scoreTextColor(r.score)}`}>
                  {formatScore(r.score)}/10
                </span>
              </Td>
            </Tr>
          </Tooltip>
        ))}
      </DataTable>

      {openAttemptId && (
        <SimulationAttemptModal attemptId={openAttemptId} onClose={() => setOpenAttemptId(null)} />
      )}
    </>
  )
}
