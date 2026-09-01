import { Fragment, useMemo, useState } from 'react'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import type { PathAssignment, TrainingPath } from '../services/training'
import AssignmentStatusBadge from './AssignmentStatusBadge'
import DataTable, { Td, Tr } from './DataTable'
import PathStepsTrail from './PathStepsTrail'
import Select from './Select'
import Tooltip from './Tooltip'
import { STATUS_META } from './assignmentStatus'
import { ChevronDownIcon, ChevronUpIcon, TrashIcon } from './icons'
import { matchesSearch } from './tableSearch'
import { formatDate, formatDeadline, stepTarget } from './trainingFormat'

/* Chi sta percorrendo cosa, e a che punto è.
 *
 * La riga dice le due cose che si guardano da lontano: quante tappe sono
 * chiuse e quale è quella aperta adesso. Il resto sta sotto, e si apre solo
 * sulla riga che interessa: la fila intera di sei tappe per venti persone
 * sarebbe una tabella che non si legge, e quello che serve per capire se una
 * classe è ferma è il numero.
 *
 * La ricerca guarda anche il nome della tappa corrente e la parola dello
 * stato, che sono quelle che si leggono sulla riga: chi cerca "scaduto" si
 * aspetta di trovare chi è in ritardo.
 *
 * Il filtro per percorso risponde invece alla domanda opposta, quella che si
 * fa dopo aver assegnato: non «dov'è Anna» ma «a che punto sono i dodici che
 * stanno facendo l'onboarding». Ci si arriva anche dalla scheda del percorso,
 * dal numero di chi lo sta percorrendo, che è dove quella domanda nasce. */

function ProgressBar({ done, total }: { done: number; total: number }) {
  const ratio = total === 0 ? 0 : done / total
  return (
    <span className="flex items-center justify-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/6">
        <span
          className={`block h-full rounded-full ${
            ratio >= 1 ? 'bg-emerald-500' : 'bg-gradient-to-r from-violet-600 to-cyan-500'
          }`}
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
      <span className="text-[0.82rem] tabular-nums text-slate-300">
        {done}/{total}
      </span>
    </span>
  )
}

export default function TrainingAssignmentsTable({
  assignments,
  paths,
  pathFilter,
  onPathFilterChange,
  showOrganization,
  onWithdraw,
}: {
  assignments: PathAssignment[]
  /** I percorsi su cui si può restringere l'elenco, quelli dello scope. */
  paths: TrainingPath[]
  /** Il percorso su cui si sta guardando, vuoto per tutti quanti. */
  pathFilter: string
  onPathFilterChange: (pathId: string) => void
  showOrganization: boolean
  onWithdraw: (assignment: PathAssignment) => void
}) {
  /* La casella scrive subito, il filtro aspetta la fine della parola: le
   * assegnazioni di un tenant sono tutte qui, e riscorrerle a ogni tasto
   * premuto ridisegnava la tabella una volta per lettera. */
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [openId, setOpenId] = useState<string | null>(null)

  /* Il filtro per percorso lavora sulle righe già in mano e non su una
   * seconda chiamata: le assegnazioni dello scope sono già tutte qui, e
   * chiederle di nuovo al server per percorso vorrebbe dire aspettare una
   * risposta per un sottoinsieme di quello che si sta già guardando. */
  const rows = useMemo(
    () =>
      assignments.filter((a) => {
        if (pathFilter && a.path_id !== pathFilter) return false
        const current = a.current_position ? a.steps[a.current_position - 1] : null
        return matchesSearch(
          debouncedSearch,
          a.user_name,
          a.user_email,
          a.path_title,
          a.organization_name ?? '',
          current ? stepTarget(current) : '',
          STATUS_META[a.status].label,
        )
      }),
    [assignments, debouncedSearch, pathFilter],
  )

  const filteredPath = paths.find((path) => path.id === pathFilter)

  return (
    <DataTable
      /* Le percentuali sommano a 100: le tre colonne di testo si dividono la
         metà buona della riga, le altre stanno alla misura di quello che
         contengono (una barra, una data, una targhetta, due bottoncini).

         L'avanzamento si ordina sulla frazione e non sul numero di tappe
         chiuse: tre tappe su quattro sono più avanti di tre su otto, e chi
         ordina per avanzamento cerca chi è più vicino alla fine. La tappa
         corrente sul numero, che è l'ordine del percorso. */
      columns={[
        { key: 'utente', label: 'Utente', width: '21%', sortValue: (a) => a.user_name },
        { key: 'percorso', label: 'Percorso', width: '18%', sortValue: (a) => a.path_title },
        {
          key: 'tappa',
          label: 'Tappa Corrente',
          width: '15%',
          sortValue: (a) => a.current_position,
        },
        {
          key: 'avanzamento',
          label: 'Avanzamento',
          width: '14%',
          sortValue: (a) => (a.steps.length === 0 ? 0 : a.completed_steps / a.steps.length),
        },
        { key: 'assegnato', label: 'Assegnato', width: '11%', sortValue: (a) => a.created_at },
        {
          key: 'stato',
          label: 'Stato',
          width: '12%',
          sortValue: (a) => STATUS_META[a.status].label,
        },
        { key: 'azioni', label: '', width: '9%' },
      ]}
      items={rows}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Cerca per utente, percorso o stato..."
      /* La tendina dei percorsi solo quando ce n'è più d'uno: con un percorso
         solo sarebbe un filtro che non toglie niente. Sta nella fascia della
         tabella e non in cima alla pagina, accanto a quello delle
         organizzazioni, perché quello vale per entrambe le linguette mentre
         questo parla delle sole righe qui sotto. */
      searchActions={
        paths.length > 1 ? (
          <Select
            id="assignments-path-filter"
            ariaLabel="Percorso"
            className="min-w-[220px]"
            value={pathFilter}
            onChange={onPathFilterChange}
            options={[
              { value: '', label: 'Tutti i percorsi' },
              ...paths.map((path) => ({ value: path.id, label: path.title })),
            ]}
          />
        ) : undefined
      }
      pageResetKey={`${pathFilter}|${debouncedSearch}`}
      emptyMessage={
        debouncedSearch
          ? 'Nessun percorso corrisponde alla ricerca'
          : filteredPath
            ? `Nessuno sta percorrendo «${filteredPath.title}»`
            : 'Nessun percorso ancora assegnato per la selezione corrente'
      }
      renderRow={(a) => {
        const isOpen = openId === a.id
        const current = a.current_position ? a.steps[a.current_position - 1] : null
        return (
          <Fragment key={a.id}>
            {/* `onActivate` e non un `onClick` scritto a mano: la riga si apre
                anche da tastiera, con il fuoco, Invio e Spazio, che è come
                si aprono tutte le righe che si aprono in questa applicazione
                (vedi `DataTable`). Prima rispondeva al solo mouse, e chi
                naviga con il Tab aveva la sola freccia in fondo alla riga. */}
            <Tr aria-expanded={isOpen} onActivate={() => setOpenId(isOpen ? null : a.id)}>
              {/* Chi è: il nome, l'email sotto e l'organizzazione sotto
                  ancora, una riga per cosa. Stavano su due righe con
                  organizzazione ed email separate da un punto, che è una riga
                  da leggere tutta per prenderne metà. Le righe partono dallo
                  stesso punto (allineate a sinistra, mentre l'intestazione
                  resta al centro come tutte le altre), così la colonna si
                  scorre con l'occhio invece di rileggersi ogni volta.

                  L'organizzazione la vede solo il super admin: a un org admin
                  direbbe, riga per riga, la sola organizzazione che può
                  vedere. */}
              <Td align="left">
                <span className="block text-[0.85rem] font-medium text-slate-100">
                  {a.user_name}
                </span>
                <span className="block text-[0.72rem] text-slate-500">{a.user_email}</span>
                {showOrganization && a.organization_name && (
                  <span className="block text-[0.72rem] text-slate-500">{a.organization_name}</span>
                )}
              </Td>
              <Td className="text-[0.85rem] text-slate-100">{a.path_title}</Td>
              <Td>
                {current ? (
                  <>
                    <span className="block text-[0.85rem] text-slate-100">
                      {a.current_position}. {stepTarget(current)}
                    </span>
                    {current.due_at && (
                      <span className="block text-[0.72rem] text-slate-500">
                        entro il {formatDeadline(current.due_at)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[0.85rem] text-emerald-400">tutte superate</span>
                )}
              </Td>
              <Td>
                <ProgressBar done={a.completed_steps} total={a.steps.length} />
              </Td>
              <Td className="text-[0.82rem] text-slate-400">{formatDate(a.created_at)}</Td>
              <Td>
                <AssignmentStatusBadge status={a.status} />
              </Td>
              <Td>
                <span className="flex items-center justify-center gap-1">
                  <Tooltip content={isOpen ? 'Chiudi le tappe' : 'Mostra le tappe'}>
                    <button
                      type="button"
                      className="cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 transition hover:bg-white/8 hover:text-slate-200"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenId(isOpen ? null : a.id)
                      }}
                      aria-label={`${isOpen ? 'Nascondi' : 'Mostra'} le tappe di ${a.user_name}`}
                      aria-expanded={isOpen}
                    >
                      {isOpen ? <ChevronUpIcon size={15} /> : <ChevronDownIcon size={15} />}
                    </button>
                  </Tooltip>
                  <Tooltip content="Ritira il percorso">
                    <button
                      type="button"
                      className="cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation()
                        onWithdraw(a)
                      }}
                      aria-label={`Ritira il percorso di ${a.user_name}`}
                    >
                      <TrashIcon size={15} />
                    </button>
                  </Tooltip>
                </span>
              </Td>
            </Tr>
            {isOpen && (
              <Tr hover={false}>
                {/* Le tappe che si aprono sono un elenco, non una riga di
                    colonne: restano allineate a sinistra. */}
                <Td colSpan={7} align="left" className="bg-gray-950/40">
                  <PathStepsTrail steps={a.steps} />
                </Td>
              </Tr>
            )}
          </Fragment>
        )
      }}
    />
  )
}
