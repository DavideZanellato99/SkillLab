import { Fragment, useMemo, useState } from 'react'
import type { PathAssignment } from '../services/training'
import AssignmentStatusBadge from './AssignmentStatusBadge'
import DataTable, { Td, Tr } from './DataTable'
import PathStepsTrail from './PathStepsTrail'
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
 * aspetta di trovare chi è in ritardo. */

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
  showOrganization,
  onWithdraw,
}: {
  assignments: PathAssignment[]
  showOrganization: boolean
  onWithdraw: (assignment: PathAssignment) => void
}) {
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const rows = useMemo(
    () =>
      assignments.filter((a) => {
        const current = a.current_position ? a.steps[a.current_position - 1] : null
        return matchesSearch(
          search,
          a.user_name,
          a.user_email,
          a.path_title,
          a.organization_name ?? '',
          current ? stepTarget(current) : '',
          STATUS_META[a.status].label,
        )
      }),
    [assignments, search],
  )

  return (
    <DataTable
      /* Le percentuali sommano a 100: le tre colonne di testo si dividono la
         metà buona della riga, le altre stanno alla misura di quello che
         contengono (una barra, una data, una targhetta, due bottoncini). */
      columns={[
        { key: 'utente', label: 'Utente', width: '21%' },
        { key: 'percorso', label: 'Percorso', width: '18%' },
        { key: 'tappa', label: 'Tappa Corrente', width: '15%' },
        { key: 'avanzamento', label: 'Avanzamento', width: '14%' },
        { key: 'assegnato', label: 'Assegnato', width: '11%' },
        { key: 'stato', label: 'Stato', width: '12%' },
        { key: 'azioni', label: '', width: '9%' },
      ]}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Cerca per utente, percorso o stato..."
      isEmpty={rows.length === 0}
      emptyMessage={
        search
          ? 'Nessun percorso corrisponde alla ricerca'
          : 'Nessun percorso ancora assegnato per la selezione corrente'
      }
    >
      {rows.map((a) => {
        const isOpen = openId === a.id
        const current = a.current_position ? a.steps[a.current_position - 1] : null
        return (
          <Fragment key={a.id}>
            <Tr className="cursor-pointer" onClick={() => setOpenId(isOpen ? null : a.id)}>
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
      })}
    </DataTable>
  )
}
