import { useMemo, useState } from 'react'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { fetchEvaluationsReportXlsx } from '../services/admin'
import type { EvaluationReportRow } from '../services/admin'
import { saveBlob } from '../services/api'
import ConversationDetailModal from './ConversationDetailModal'
import ConversationModeBadge from './ConversationModeBadge'
import { conversationModeLabel } from './conversationMode'
import DataTable, { Td, Tr } from './DataTable'
import type { DataTableColumn } from './DataTable'
import { shortCriterionLabel } from './evaluationCriteria'
import FormError from './FormError'
import { DownloadIcon } from './icons'
import { formatDateTime, formatScore, personName, scoreTextColor } from './scoreFormat'
import type { CriterionAverage } from './scoreFormat'
import Spinner from './Spinner'
import { matchesSearch } from './tableSearch'
import Tooltip from './Tooltip'

/* La tabella delle valutazioni in fondo alla vista dei punteggi: ogni
 * conversazione giudicata con i suoi voti, la ricerca, il foglio Excel e la
 * finestra che si apre da una riga.
 *
 * Sta in un file suo perché è l'unica parte della vista che non disegna una
 * media: sopra ci sono i grafici, che rispondono a "come va il gruppo",
 * qui c'è la riga per riga, che risponde a "cosa è successo in questa
 * conversazione". Le due cose crescono per ragioni diverse, e tenerle
 * insieme faceva un file in cui il calcolo delle medie e il riparto delle
 * colonne si leggevano di seguito. */

/* Le colonne di questa tabella sono le uniche dell'app a non essere note in
 * anticipo: i criteri arrivano dal backend, quindi il riparto si calcola
 * invece di essere scritto a mano. Si parte dalla misura che ogni colonna
 * vuole in pixel, e da lì escono sia le percentuali sia la larghezza minima
 * della tabella.
 *
 * Le misure sono strette apposta. Sotto la larghezza minima è il riquadro a
 * scorrere di lato, e con undici colonne larghe si scorreva sempre: la
 * pagina è larga 1200px, il contenuto 1152, e la somma di prima ne chiedeva
 * quasi milleseicento. Scorrere di lato è il modo peggiore di leggere questa
 * tabella, perché per arrivare all'ultimo criterio si perde di vista la
 * conversazione di cui si sta guardando il voto. La somma di adesso è 1130px
 * e ci sta, e a pagare sono i titoli lunghi, che vanno a capo su due righe:
 * una riga alta il doppio si legge, una tabella che scappa a destra no.
 *
 * Il padding stretto (`compact`) è per tutte le colonne e non solo per
 * quelle dei criteri: dodici pixel per lato invece di ventiquattro sono
 * centoventi pixel di testo in più su undici colonne, cioè la differenza fra
 * un titolo su due righe e uno su tre. */
const EVALUATION_COLUMN_PX = {
  conversazione: 170,
  data: 110,
  utente: 125,
  avatar: 100,
  criterio: 90,
  voto: 85,
}

function evaluationColumns(criteria: CriterionAverage[]) {
  const px = EVALUATION_COLUMN_PX
  const totalPx =
    px.conversazione + px.data + px.utente + px.avatar + px.voto + criteria.length * px.criterio
  const width = (columnPx: number) => `${((columnPx / totalPx) * 100).toFixed(2)}%`

  /* Ogni colonna sa da sé su cosa si ordina, criteri compresi: quella di un
     criterio legge il proprio punteggio dalla riga, e una conversazione a cui
     quel criterio non è stato dato finisce in fondo invece di valere zero,
     che è un voto e non un'assenza. È la colonna che risponde a "su cosa
     inciampa questo gruppo", e a occhio, su una tabella di sei numeri per
     riga, non si legge. */
  const columns: DataTableColumn<EvaluationReportRow>[] = [
    {
      key: 'conversazione',
      label: 'Conversazione',
      compact: true,
      width: width(px.conversazione),
      sortValue: (r) => r.conversation_title,
    },
    {
      key: 'utente',
      label: 'Utente',
      compact: true,
      width: width(px.utente),
      sortValue: (r) => personName(r),
    },
    {
      key: 'data',
      label: 'Data',
      compact: true,
      width: width(px.data),
      sortValue: (r) => r.conversation_at,
    },
    {
      key: 'avatar',
      label: 'Avatar',
      compact: true,
      width: width(px.avatar),
      sortValue: (r) => r.avatar_name,
    },
    ...criteria.map((c) => ({
      key: c.key,
      label: shortCriterionLabel(c.key, c.label),
      title: c.label,
      compact: true,
      width: width(px.criterio),
      sortValue: (r: EvaluationReportRow) => r.criteria[c.key] ?? null,
    })),
    {
      key: 'voto',
      label: 'Voto',
      compact: true,
      width: width(px.voto),
      sortValue: (r) => r.overall_score,
    },
  ]

  return { minWidth: `${totalPx}px`, columns }
}

export default function DashboardEvaluationsTable({
  rows,
  criteria,
  organizationId,
  days,
  exportable,
  onReviewSaved,
}: {
  /** Le valutazioni da mostrare, già filtrate dalla pagina. */
  rows: EvaluationReportRow[]
  /** I criteri presenti nei dati, che sono anche le colonne dei voti. */
  criteria: CriterionAverage[]
  /** L'organizzazione e il periodo che il foglio Excel deve rispettare. */
  organizationId: string
  days?: number
  /** Se c'è qualcosa da esportare, cioè se il periodo ha valutazioni. */
  exportable: boolean
  onReviewSaved: () => void
}) {
  /* La casella scrive subito, il filtro aspetta la fine della parola. È la
   * ricerca dove conta di più: sotto ci sono tutte le valutazioni del
   * periodo, e senza attesa ogni tasto premuto le riscorreva tutte per
   * ridisegnare una tabella di dieci righe. */
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [detailRow, setDetailRow] = useState<EvaluationReportRow | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const table = useMemo(() => evaluationColumns(criteria), [criteria])

  const searchedRows = useMemo(
    () =>
      rows.filter((r) =>
        matchesSearch(
          debouncedSearch,
          r.conversation_title,
          // The channel is searchable by the same word the badge shows
          conversationModeLabel(r.mode),
          personName(r),
          r.user_email,
          r.avatar_name,
          formatDateTime(r.conversation_at),
        ),
      ),
    [rows, debouncedSearch],
  )

  /* Excel del report: le stesse righe che il server ha mandato a questa
   * pagina, cioè la stessa organizzazione e lo stesso periodo. Le fette più
   * fini (la persona, il canale) restano all'autofiltro del foglio, e il
   * tooltip lo dice invece di lasciarlo scoprire aprendo il file.
   * Resta fuori da TanStack perché produce un file da salvare, non uno
   * stato da tenere in cache. */
  const handleExportXlsx = async () => {
    if (isExporting) return
    setIsExporting(true)
    setExportError('')
    try {
      const blob = await fetchEvaluationsReportXlsx(organizationId || undefined, days)
      saveBlob(blob, `report-valutazioni-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Esportazione non riuscita.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <>
      {/* L'esportazione fallita si dice qui, accanto al bottone che l'ha
          chiesta: è un file non prodotto, non una pagina senza dati. */}
      {exportError && <FormError message={exportError} variant="page" />}

      {/* Vista tabellare: tutti i valori raggiungibili senza hover */}
      <DataTable
        columns={table.columns}
        minWidth={table.minWidth}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cerca per conversazione, utente o avatar..."
        searchActions={
          <Tooltip content="Scarica in Excel le valutazioni del periodo e dell'organizzazione selezionati, senza i filtri per utente e canale">
            <button
              type="button"
              className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-[0.85rem] font-medium text-slate-400 transition hover:-translate-y-px hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              onClick={handleExportXlsx}
              disabled={isExporting || !exportable}
            >
              {isExporting ? <Spinner variant="small" /> : <DownloadIcon size={15} />}
              Esporta Excel
            </button>
          </Tooltip>
        }
        items={searchedRows}
        emptyMessage={
          debouncedSearch
            ? 'Nessuna valutazione corrisponde alla ricerca'
            : 'Nessuna valutazione per la selezione corrente'
        }
        renderRow={(r) => (
          <Tooltip
            key={r.conversation_id}
            content="Vedi conversazione e valutazione"
            anchor="cursor"
          >
            <Tr onActivate={() => setDetailRow(r)}>
              <Td compact align="left">
                <div className="flex items-center gap-2">
                  <ConversationModeBadge mode={r.mode} iconOnly />
                  <span className="text-[0.85rem] font-medium text-slate-100">
                    {r.conversation_title}
                  </span>
                </div>
              </Td>
              <Td compact>
                <span className="text-[0.85rem] font-medium text-slate-100">{personName(r)}</span>
              </Td>
              <Td compact className="text-[0.82rem] text-slate-400">
                {formatDateTime(r.conversation_at)}
              </Td>
              <Td compact className="text-[0.82rem] text-slate-400">
                {r.avatar_name}
              </Td>
              {criteria.map((c) => {
                const score = r.criteria[c.key]
                return (
                  <Td key={c.key} compact>
                    {score === undefined ? (
                      <span className="text-slate-600">—</span>
                    ) : (
                      <span
                        className={`text-[0.82rem] font-semibold tabular-nums ${scoreTextColor(score)}`}
                      >
                        {formatScore(score)}
                      </span>
                    )}
                  </Td>
                )
              })}
              <Td compact>
                {/* Il voto in colonna è quello che conta: se un docente l'ha
                    corretto va detto, altrimenti la tabella sembrerebbe
                    contraddire la valutazione automatica.

                    L'etichetta è fuori dal flusso (absolute): la cella è
                    centrata in verticale, quindi una seconda riga vera
                    alzerebbe il numero. Riservare lo spazio in tutte le celle
                    allineava i voti fra loro ma spostava l'intera colonna
                    rispetto a quelle dei criteri; così invece il numero non si
                    muove di un pixel, con o senza correzione. */}
                <span
                  className={`relative block text-sm font-bold tabular-nums ${scoreTextColor(r.overall_score)}`}
                >
                  {formatScore(r.overall_score)}/10
                  {r.has_override && (
                    <Tooltip
                      content={`Punteggio corretto dal docente, la valutazione automatica assegnava ${formatScore(r.ai_overall_score)}`}
                    >
                      <span className="absolute inset-x-0 top-full whitespace-nowrap text-[0.7rem] font-semibold text-violet-300">
                        corretto
                      </span>
                    </Tooltip>
                  )}
                </span>
              </Td>
            </Tr>
          </Tooltip>
        )}
      />

      {detailRow && (
        <ConversationDetailModal
          row={detailRow}
          onClose={() => setDetailRow(null)}
          onReviewSaved={onReviewSaved}
          /* Eliminata di lì: la schermata si chiude su una conversazione che
             non c'è più, la tabella sotto si rilegge da sola. */
          onDeleted={() => setDetailRow(null)}
        />
      )}
    </>
  )
}
