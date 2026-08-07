/* Modale di conferma riusabile: overlay, icona, titolo, descrizione, corpo
 * opzionale, banner d'errore e i due bottoni Annulla / conferma (con spinner
 * mentre l'azione è in corso). Consolida le modali di conferma dell'app
 * (cambio stato, rinvio credenziali, sospensione ed eliminazione di utenti,
 * organizzazioni, avatar e conversazioni), prima ricopiate una per una.
 *
 * Durante l'azione (`isPending`) tutto si blocca: niente chiusura da overlay,
 * da X o dal bottone Annulla, così l'operazione non può essere interrotta a
 * metà. */

import type { ReactNode } from 'react'
import Spinner from './Spinner'
import FormError from './FormError'
import ModalShell, { ModalHeader } from './ModalShell'

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
  /** Blocca la conferma anche fuori dall'attesa: serve alle azioni che
   *  chiedono prima qualcosa in `children` (es. riscrivere il nome). */
  confirmDisabled?: boolean
  /** Sopra la modale da cui l'azione è partita, quando parte da dentro una:
   *  la conferma è l'ultima cosa comparsa e va letta sopra il resto. */
  elevated?: boolean
  onConfirm: () => void
  onClose: () => void
  /** Campi che l'azione chiede prima di procedere (motivo, conferma del
   *  nome), tra la descrizione e il banner d'errore. */
  children?: ReactNode
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
  confirmDisabled = false,
  elevated = false,
  onConfirm,
  onClose,
  children,
}: ConfirmModalProps) {
  return (
    <ModalShell onClose={onClose} locked={isPending} elevated={elevated}>
      <ModalHeader
        icon={icon}
        iconWrapperCls={iconWrapperCls}
        title={title}
        description={description}
      />

      {children}

      {error && <FormError message={error} />}

      <div className="flex gap-3">
        <button className={cancelBtnCls} onClick={onClose} disabled={isPending}>
          Annulla
        </button>
        <button
          className={`${confirmBaseCls} ${confirmClassName}`}
          onClick={onConfirm}
          disabled={isPending || confirmDisabled}
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
    </ModalShell>
  )
}
