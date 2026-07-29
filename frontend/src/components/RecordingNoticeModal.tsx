/* L'avviso che precede l'apertura del microfono (GDPR art. 13).
 *
 * Dice tre cose, perché sono tre trattamenti distinti e sono esattamente
 * quelli che una persona non si aspetta da un esercizio di training: la voce
 * viene registrata, la registrazione viene trascritta, e la trascrizione
 * viene valutata da un modello con un punteggio che i formatori della sua
 * organizzazione leggono.
 *
 * Non è una raccolta di consenso, e il bottone non dice "Accetto": per un
 * dipendente il consenso non sarebbe comunque una base giuridica valida
 * (squilibrio di potere), quindi qui si informa e basta. Chi non vuole
 * procedere annulla e la chiamata non parte.
 */

import { createPortal } from 'react-dom'
import ConfirmModal from './ConfirmModal'

interface RecordingNoticeModalProps {
  onAccept: () => void
  onClose: () => void
}

const itemCls = 'flex items-start gap-2.5 text-left'
const dotCls = 'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400'

export default function RecordingNoticeModal({ onAccept, onClose }: RecordingNoticeModalProps) {
  /* Montata su document.body: il pulsante di chiamata vive dentro un dock
   * con backdrop-blur, e un filtro CSS crea un containing block per i
   * discendenti in position:fixed. Senza portal l'overlay si centrerebbe
   * sul dock invece che sulla finestra, e l'avviso resterebbe tagliato a
   * metà fuori schermo, che è il modo peggiore di informare qualcuno. */
  return createPortal(
    <ConfirmModal
      icon={
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-red-400"
        >
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
        </svg>
      }
      iconWrapperCls="border border-red-500/25 bg-red-500/10"
      title="Questa chiamata viene registrata"
      description={
        <span className="flex flex-col gap-2.5 text-[0.85rem] text-slate-400">
          <span className={itemCls}>
            <span className={dotCls} />
            <span>
              La tua voce viene <strong className="text-slate-300">registrata</strong> per tutta la
              durata della chiamata e l'audio viene conservato.
            </span>
          </span>
          <span className={itemCls}>
            <span className={dotCls} />
            <span>
              La conversazione viene <strong className="text-slate-300">trascritta</strong> e la
              trascrizione resta consultabile.
            </span>
          </span>
          <span className={itemCls}>
            <span className={dotCls} />
            <span>
              Un sistema di intelligenza artificiale{' '}
              <strong className="text-slate-300">valuta la tua prestazione</strong> e assegna un
              punteggio, che i formatori della tua organizzazione possono leggere e correggere.
            </span>
          </span>
          <span className="mt-1 text-[0.78rem] text-slate-500">
            Puoi scaricare o far cancellare questi dati in qualsiasi momento dalla pagina Profilo.
            Se preferisci non essere registrato, annulla: puoi allenarti in modalità chat scritta.
          </span>
        </span>
      }
      confirmLabel="Ho capito, avvia la chiamata"
      pendingLabel="Avvio..."
      confirmClassName="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white hover:shadow-[0_6px_20px_rgba(16,185,129,0.35)]"
      isPending={false}
      onConfirm={onAccept}
      onClose={onClose}
    />,
    document.body,
  )
}
