/* Una riga del registro attività, e il pannello che si apre sotto.
 *
 * In tabella ci sta il fatto, cioè chi ha fatto cosa, quando e com'è andata;
 * nel pannello ci sta la richiesta per esteso, che serve solo quando su quella
 * riga si sta indagando davvero. */

import { Fragment } from 'react'
import type { AuditLog } from '../services/auditLogs'
import { ROLE_BADGE_CLASSES, ROLE_LABELS } from '../services/auth'
import {
  AUDIT_COLUMNS,
  OUTCOME_CLASSES,
  OUTCOME_MEANINGS,
  statusOutcome,
  summarize,
} from './auditFormat'
import { Td, Tr } from './DataTable'
import { formatTimestamp } from './dateFormat'
import { ChevronDownIcon } from './icons'
import Tooltip from './Tooltip'

interface AuditLogRowProps {
  log: AuditLog
  isExpanded: boolean
  onToggle: () => void
}

export default function AuditLogRow({ log, isExpanded, onToggle }: AuditLogRowProps) {
  const details = summarize(log)
  const outcome = statusOutcome(log.status_code)

  return (
    <Fragment>
      {/* `onActivate` e non un `onClick` scritto a mano: aprire la riga è
        l'unica cosa che si fa qui dentro, e con il solo clic chi gira con il
        tabulatore non aveva nessun modo di farlo. Da lì arrivano il fuoco,
        Invio e Spazio. */}
      <Tr
        hover={!isExpanded}
        className={isExpanded ? '[&>td]:bg-violet-600/6' : ''}
        aria-expanded={isExpanded}
        onActivate={onToggle}
      >
        <Td>
          <span className="whitespace-nowrap text-[0.85rem] tabular-nums text-slate-400">
            {formatTimestamp(log.created_at)}
          </span>
        </Td>
        <Td>
          <div className="flex flex-col items-center">
            <span className="text-[0.85rem] font-semibold text-slate-100">
              {log.user_email || '—'}
            </span>
            {log.user_role && (
              <span
                className={`mt-1 w-fit rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider ${ROLE_BADGE_CLASSES[log.user_role] ?? ''}`}
              >
                {ROLE_LABELS[log.user_role] ?? log.user_role}
              </span>
            )}
          </div>
        </Td>
        <Td>
          <span className="text-[0.85rem] text-slate-300">{log.organization_name ?? '—'}</span>
        </Td>
        <Td>
          <span className="text-[0.85rem] font-medium text-slate-100">{log.action_label}</span>
        </Td>
        <Td>
          {/* La chiave e il valore non si vestono uguale: la prima è
            l'etichetta, il secondo è quello che si sta cercando con l'occhio.
            Tutti in una riga sola, con il tooltip quando non ci sta: il
            riassunto per esteso è nel pannello. */}
          <Tooltip
            content={details.map((d) => `${d.label}: ${d.value}`).join(' · ')}
            anchor="cursor"
            truncateOnly
          >
            <span className="mx-auto block max-w-[320px] truncate text-[0.8rem]">
              {details.length === 0 ? (
                <span className="text-slate-500">—</span>
              ) : (
                details.map((d, i) => (
                  <Fragment key={d.key}>
                    {i > 0 && <span className="text-slate-600"> · </span>}
                    <span className="text-slate-500">{d.label}: </span>
                    <span className="text-slate-300">{d.value}</span>
                  </Fragment>
                ))
              )}
            </span>
          </Tooltip>
        </Td>
        <Td compact>
          {/* Il numero è il dato vero e resta scritto, perché su una richiesta
            precisa è quello che si va a cercare; la frase gli sta accanto nel
            tooltip, perché 403 e 422 vogliono dire qualcosa solo per chi li ha
            già visti. */}
          <Tooltip content={OUTCOME_MEANINGS[outcome]}>
            <span
              className={`inline-block rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold tabular-nums ${OUTCOME_CLASSES[outcome]}`}
            >
              {log.status_code}
            </span>
          </Tooltip>
        </Td>
        <Td>
          <ChevronDownIcon
            size={16}
            className={`inline-block text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </Td>
      </Tr>

      {isExpanded && (
        <tr>
          {/* Il pannello che si apre non è una riga di colonne ma un elenco di
            voci e valori: resta allineato a sinistra, dove un elenco si
            legge. */}
          <Td colSpan={AUDIT_COLUMNS.length} align="left" className="bg-gray-950/40">
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[0.8rem]">
              <dt className="text-slate-500">Richiesta</dt>
              <dd className="break-all font-mono text-slate-300">
                {log.method} {log.path}
              </dd>
              <dt className="text-slate-500">Risorsa</dt>
              <dd className="break-all font-mono text-slate-300">
                {log.resource_type ? `${log.resource_type} ` : ''}
                {log.resource_id ?? '—'}
              </dd>
              <dt className="text-slate-500">Indirizzo IP</dt>
              <dd className="font-mono text-slate-300">{log.client_ip || '—'}</dd>
              <dt className="text-slate-500">Browser</dt>
              <dd className="break-all text-slate-400">{log.user_agent || '—'}</dd>
              {log.details && (
                <>
                  <dt className="text-slate-500">Dettagli</dt>
                  {/* Qui il JSON resta com'è arrivato: il riassunto in tabella
                    è per leggere in fretta, questo è la riga com'è stata
                    scritta, e va potuta confrontare parola per parola. */}
                  <dd className="whitespace-pre-wrap break-all font-mono text-slate-300">
                    {JSON.stringify(log.details, null, 2)}
                  </dd>
                </>
              )}
            </dl>
          </Td>
        </tr>
      )}
    </Fragment>
  )
}
