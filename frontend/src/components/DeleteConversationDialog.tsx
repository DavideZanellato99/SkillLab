import { useDeleteConversation } from '../hooks/useConversations'
import ConfirmModal from './ConfirmModal'
import { TrashIcon } from './icons'
import { formatDateTime } from './dateFormat'

/* La conferma con cui si elimina una conversazione, da qualunque parte la si
 * chieda: il cestino sulla riga del report attività e quello in testa alla
 * schermata che la apre per intero.
 *
 * Sta in un file suo perché quello che va detto prima di premere è sempre lo
 * stesso, cioè che spariscono anche la trascrizione e la valutazione e che
 * non si torna indietro, e una frase del genere riscritta in due punti prima
 * o poi cambia solo in uno dei due.
 *
 * L'eliminazione è degli amministratori: il server la concede al super admin
 * su tutte le organizzazioni e all'organization admin sulla propria, e chi ha
 * tenuto la conversazione non ha nessun endpoint per cancellarsi lo storico.
 * Qui non si controlla nessun ruolo: questa conferma la monta chi mostra il
 * cestino, ed è lì che si decide chi lo vede. */

export default function DeleteConversationDialog({
  conversationId,
  avatarName,
  conversationAt,
  elevated = false,
  onClose,
  onDeleted,
}: {
  conversationId: string
  /** Con chi si era parlato: la conversazione si riconosce da lui e dalla data. */
  avatarName: string
  conversationAt: string
  /** Vero quando la conferma parte da dentro un'altra modale. */
  elevated?: boolean
  onClose: () => void
  /** Eliminata: chi ospita la conferma chiude anche quello che la mostrava. */
  onDeleted: () => void
}) {
  const mutation = useDeleteConversation()

  const confirm = async () => {
    try {
      await mutation.mutateAsync(conversationId)
      onDeleted()
    } catch {
      // Il messaggio resta nella mutation, la conferma lo mostra
    }
  }

  return (
    <ConfirmModal
      icon={<TrashIcon size={24} stroke="#ef4444" />}
      iconWrapperCls="border border-red-500/25 bg-red-500/10"
      title="Elimina Conversazione"
      description={
        <>
          Stai per eliminare la conversazione con{' '}
          <strong className="text-slate-100">{avatarName}</strong> del{' '}
          {formatDateTime(conversationAt)}, incluse tutte le sue trascrizioni e valutazioni.
          L'operazione non è reversibile.
        </>
      }
      error={mutation.error instanceof Error ? mutation.error.message : undefined}
      confirmLabel="Elimina Definitivamente"
      pendingLabel="Eliminazione..."
      confirmClassName="border-none bg-red-500 text-white hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)]"
      isPending={mutation.isPending}
      elevated={elevated}
      onConfirm={() => void confirm()}
      onClose={onClose}
    />
  )
}
