/* L'avviso che precede la condivisione dello schermo (GDPR art. 13).
 *
 * Il gemello di `RecordingNoticeModal` per il test tecnico che registra lo
 * schermo. Dice le tre cose che una persona deve sapere prima di premere
 * "inizia" e non dopo: cosa viene registrato (lo schermo intero, non la sola
 * pagina del test), chi lo guarda (gli amministratori della sua
 * organizzazione, per rileggere il tentativo), e cosa succede se interrompe
 * la condivisione a metà (il test viene consegnato in quell'istante).
 *
 * Come per la voce, non è una raccolta di consenso e il bottone non dice
 * "Accetto": per un dipendente il consenso non sarebbe una base giuridica
 * valida, quindi qui si informa. Chi non vuole procedere annulla e il test
 * non parte. Compare la prima volta per ogni utente su ogni browser (vedi
 * `recordingNotice.ts`); dopo, a ricordarlo restano la regola scritta fra
 * quelle del test e l'indicatore fisso durante lo svolgimento.
 *
 * Il bottone di conferma è anche il gesto da cui parte la richiesta al
 * browser: `getDisplayMedia` si apre solo dentro un clic, quindi chi ci
 * chiama deve chiedere lo schermo subito, senza attese di mezzo. */

import { createPortal } from 'react-dom'
import ConfirmModal from './ConfirmModal'
import { MonitorIcon } from './icons'

interface ScreenRecordingNoticeModalProps {
  onAccept: () => void
  onClose: () => void
}

const itemCls = 'flex items-start gap-2.5 text-left'
const dotCls = 'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400'

export default function ScreenRecordingNoticeModal({
  onAccept,
  onClose,
}: ScreenRecordingNoticeModalProps) {
  return createPortal(
    <ConfirmModal
      icon={<MonitorIcon size={24} className="text-red-400" />}
      iconWrapperCls="border border-red-500/25 bg-red-500/10"
      title="Questo test registra lo schermo"
      description={
        <span className="flex flex-col gap-2.5 text-[0.85rem] text-slate-400">
          <span className={itemCls}>
            <span className={dotCls} />
            <span>
              L'<strong className="text-slate-300">intero schermo</strong> viene registrato
              dall'avvio del test fino alla consegna, e la registrazione viene conservata insieme al
              tentativo.
            </span>
          </span>
          <span className={itemCls}>
            <span className={dotCls} />
            <span>
              La registrazione è{' '}
              <strong className="text-slate-300">consultabile dai formatori</strong> della tua
              organizzazione quando rileggono il tentativo.
            </span>
          </span>
          <span className={itemCls}>
            <span className={dotCls} />
            <span>
              Se <strong className="text-slate-300">interrompi la condivisione</strong> durante il
              test, il test viene consegnato in quel momento con le risposte fornite fino a lì.
            </span>
          </span>
          <span className="mt-1 text-[0.78rem] text-slate-500">
            Alla richiesta del browser scegli l'intero schermo, non una singola finestra. Puoi
            scaricare o far cancellare la registrazione in qualsiasi momento dalla pagina Profilo.
          </span>
        </span>
      }
      confirmLabel="Ho capito, condividi lo schermo"
      pendingLabel="Avvio..."
      confirmClassName="bg-gradient-to-br from-violet-600 to-violet-700 text-white hover:shadow-[0_6px_20px_rgba(124,58,237,0.35)]"
      isPending={false}
      onConfirm={onAccept}
      onClose={onClose}
    />,
    document.body,
  )
}
