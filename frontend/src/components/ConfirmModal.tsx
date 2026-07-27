/* Modale di conferma riusabile: overlay, icona, titolo, descrizione, banner
 * d'errore e i due bottoni Annulla / conferma (con spinner mentre l'azione è
 * in corso). Consolida le modali di conferma dell'area admin (cambio stato,
 * rinvio credenziali, eliminazione), prima ricopiate una per una.
 *
 * Durante l'azione (`isPending`) tutto si blocca: niente chiusura da overlay,
 * da X o dal bottone Annulla, così l'operazione non può essere interrotta a
 * metà. */

import type { ReactNode } from 'react'
import Spinner from './Spinner'
import FormError from './FormError'

const overlayCls =
  'fixed inset-0 z-[200] flex animate-fade-in items-center justify-center bg-black/60 p-4 backdrop-blur-lg [animation-duration:0.2s]'
const modalCls =
  'relative m-auto max-h-[90vh] w-full max-w-[420px] animate-modal-in overflow-y-auto overflow-x-hidden rounded-3xl border border-white/6 bg-gray-900/95 p-12 shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_60px_rgba(124,58,237,0.08)] backdrop-blur-2xl max-[480px]:rounded-2xl max-[480px]:p-8'
const modalCloseCls =
  'absolute right-4 top-4 cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 transition hover:bg-white/8 hover:text-slate-100'
const cancelBtnCls =
  'flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-60'
const confirmBaseCls =
  'flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60'

interface ConfirmModalProps {
  /** Icona 24x24 mostrata nel riquadro in cima. */
  icon: ReactNode
  /** Classi del riquadro dietro l'icona (bordo/sfondo che dà l'accento). */
  iconWrapperCls: string
  title: string
  description: ReactNode
  /** Messaggio d'errore dell'ultima azione fallita, se presente. */
  error?: string
  confirmLabel: string
  /** Etichetta mostrata accanto allo spinner mentre l'azione è in corso. */
  pendingLabel: string
  /** Classi che colorano il bottone di conferma (l'accento dell'azione). */
  confirmClassName: string
  isPending: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function ConfirmModal({
  icon,
  iconWrapperCls,
  title,
  description,
  error,
  confirmLabel,
  pendingLabel,
  confirmClassName,
  isPending,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <div className={overlayCls} onClick={() => !isPending && onClose()}>
      <div className={modalCls} onClick={(e) => e.stopPropagation()}>
        <button
          className={modalCloseCls}
          onClick={onClose}
          disabled={isPending}
          aria-label="Chiudi"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="mb-6 text-center">
          <div
            className={`mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl ${iconWrapperCls}`}
          >
            {icon}
          </div>
          <h2 className="mb-1 font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl">
            {title}
          </h2>
          <p className="text-[0.85rem] text-slate-500">{description}</p>
        </div>

        {error && <FormError message={error} />}

        <div className="flex gap-3">
          <button className={cancelBtnCls} onClick={onClose} disabled={isPending}>
            Annulla
          </button>
          <button
            className={`${confirmBaseCls} ${confirmClassName}`}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Spinner variant="button" />
                {pendingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
