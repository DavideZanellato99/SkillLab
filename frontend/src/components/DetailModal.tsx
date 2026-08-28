import type { ReactNode } from 'react'
import ModalShell from './ModalShell'
import { useModalTitleId } from './modalTitle'

/* Modale di sola lettura per mostrare tutti i dati di una riga della tabella
 * (utente o organizzazione). Header con badge/icona, titolo e sottotitolo, poi
 * un elenco di campi <DetailField>. Stessa estetica delle altre modali. */

interface DetailModalProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Badge o icona mostrata a sinistra del titolo */
  header?: ReactNode
  onClose: () => void
  /** Campi del dettaglio: una sequenza di <DetailField> */
  children: ReactNode
  /** Eventuali pulsanti di azione in fondo alla modale */
  footer?: ReactNode
}

export default function DetailModal({
  title,
  subtitle,
  header,
  onClose,
  children,
  footer,
}: DetailModalProps) {
  return (
    <ModalShell onClose={onClose} size="md" padding="md" closeLabel="Chiudi dettaglio">
      <DetailHeader header={header} title={title} subtitle={subtitle} />

      <dl className="flex flex-col">{children}</dl>

      {footer && <div className="mt-6 flex gap-3">{footer}</div>}
    </ModalShell>
  )
}

/* L'intestazione sta in un componente suo perché è lei a dire alla scatola
 * qual è il titolo della finestra, e `useModalTitleId` va chiamato da dentro
 * la scatola, non da chi la monta. */
function DetailHeader({
  header,
  title,
  subtitle,
}: Pick<DetailModalProps, 'header' | 'title' | 'subtitle'>) {
  const titleId = useModalTitleId()

  return (
    // pr-12 tiene il titolo lontano dal pulsante di chiusura
    <header className="mb-6 flex items-center gap-4 pr-12">
      {header}
      <div className="min-w-0">
        <h2
          id={titleId}
          className="truncate font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl"
        >
          {title}
        </h2>
        {subtitle && <p className="truncate text-[0.85rem] text-slate-500">{subtitle}</p>}
      </div>
    </header>
  )
}

interface DetailFieldProps {
  label: string
  children: ReactNode
  /** Valori tecnici (ID, sub): carattere monospazio e a capo su qualsiasi punto */
  mono?: boolean
}

export function DetailField({ label, children, mono = false }: DetailFieldProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/6 py-3 last:border-b-0">
      <dt className="shrink-0 pt-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd
        className={`text-right text-sm text-slate-100 ${mono ? 'break-all font-mono text-[0.78rem] text-slate-300' : ''}`}
      >
        {children}
      </dd>
    </div>
  )
}
