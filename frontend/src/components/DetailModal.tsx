import type { ReactNode } from 'react';

/* Modale di sola lettura per mostrare tutti i dati di una riga della tabella
 * (utente o organizzazione). Header con badge/icona, titolo e sottotitolo, poi
 * un elenco di campi <DetailField>. Stessa estetica delle altre modali. */

const overlayCls =
  'fixed inset-0 z-[200] flex animate-fade-in items-center justify-center bg-black/60 p-4 backdrop-blur-lg [animation-duration:0.2s]';
const modalCls =
  'relative m-auto max-h-[90vh] w-full max-w-[520px] animate-modal-in overflow-y-auto overflow-x-hidden rounded-3xl border border-white/6 bg-gray-900/95 p-10 shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_60px_rgba(124,58,237,0.08)] backdrop-blur-2xl max-[480px]:rounded-2xl max-[480px]:p-6';
const modalCloseCls =
  'absolute right-4 top-4 cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 transition hover:bg-white/8 hover:text-slate-100';

interface DetailModalProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Badge o icona mostrata a sinistra del titolo */
  header?: ReactNode;
  onClose: () => void;
  /** Campi del dettaglio: una sequenza di <DetailField> */
  children: ReactNode;
  /** Eventuali pulsanti di azione in fondo alla modale */
  footer?: ReactNode;
}

export default function DetailModal({ title, subtitle, header, onClose, children, footer }: DetailModalProps) {
  return (
    <div className={overlayCls} onClick={onClose}>
      <div className={modalCls} onClick={(e) => e.stopPropagation()}>
        <button className={modalCloseCls} onClick={onClose} aria-label="Chiudi dettaglio">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* pr-12 tiene il titolo lontano dal pulsante di chiusura */}
        <header className="mb-6 flex items-center gap-4 pr-12">
          {header}
          <div className="min-w-0">
            <h2 className="truncate font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl">{title}</h2>
            {subtitle && <p className="truncate text-[0.85rem] text-slate-500">{subtitle}</p>}
          </div>
        </header>

        <dl className="flex flex-col">{children}</dl>

        {footer && <div className="mt-6 flex gap-3">{footer}</div>}
      </div>
    </div>
  );
}

interface DetailFieldProps {
  label: string;
  children: ReactNode;
  /** Valori tecnici (ID, sub): carattere monospazio e a capo su qualsiasi punto */
  mono?: boolean;
}

export function DetailField({ label, children, mono = false }: DetailFieldProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/6 py-3 last:border-b-0">
      <dt className="shrink-0 pt-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`text-right text-sm text-slate-100 ${mono ? 'break-all font-mono text-[0.78rem] text-slate-300' : ''}`}>
        {children}
      </dd>
    </div>
  );
}
