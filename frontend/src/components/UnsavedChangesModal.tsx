import type { ReactNode } from 'react'
import ConfirmModal from './ConfirmModal'
import { InfoIcon } from './icons'

/* «Stai per perdere quello che hai scritto»: la conferma che si mette fra un
 * gesto di chiusura e una finestra piena di lavoro non salvato.
 *
 * Le parole stanno qui e non in ogni pannello perché la domanda è sempre la
 * stessa, e due finestre che la pongono in modo diverso fanno esitare proprio
 * dove serve rispondere in fretta. Quello che cambia da un posto all'altro è
 * *cosa* si perde, e infatti è l'unica cosa che si passa da fuori.
 *
 * `elevated` perché arriva quasi sempre sopra la finestra che si sta
 * chiudendo, ed è l'ultima cosa comparsa: va letta sopra il resto.
 *
 * Il bottone che chiude è colorato come un'eliminazione, perché è quello che
 * è: da lì il lavoro non torna. Quello neutro è «Continua a modificare», ed è
 * anche quello che tiene Esc e lo sfondo, cioè i due gesti con cui questa
 * conferma si chiude per sbaglio come si era chiusa la finestra sotto. */

export default function UnsavedChangesModal({
  /** Cosa si perde, detto con le parole di questa finestra. */
  description,
  onKeepEditing,
  onDiscard,
}: {
  description: ReactNode
  onKeepEditing: () => void
  onDiscard: () => void
}) {
  return (
    <ConfirmModal
      elevated
      icon={<InfoIcon size={24} />}
      iconWrapperCls="border border-amber-500/25 bg-amber-500/10 text-amber-300"
      title="Modifiche non salvate"
      description={description}
      confirmLabel="Esci senza salvare"
      cancelLabel="Continua a modificare"
      pendingLabel="Uscita..."
      confirmClassName="bg-red-500/15 text-red-300 hover:bg-red-500/25"
      isPending={false}
      onConfirm={onDiscard}
      onClose={onKeepEditing}
    />
  )
}
