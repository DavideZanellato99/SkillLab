/* Una persona del report attività aperta in sovrimpressione: la sua
 * intestazione in cima, e sotto le tre linguette con tutto quello che ha
 * fatto.
 *
 * Lo storico si apriva sotto la riga, dentro la tabella. Una riga aperta
 * spingeva giù tutte le altre, e con dentro una seconda tabella con la sua
 * ricerca, il suo filtro e le sue pagine, la schermata diventava due elenchi
 * uno dentro l'altro che scorrevano insieme: per tornare all'elenco delle
 * persone bisognava risalire, e aprirne un'altra voleva dire richiudere
 * prima quella. In una finestra lo storico ha lo spazio suo, si chiude con
 * Esc, e l'elenco dietro resta dov'era.
 *
 * Alta quanto la tabella che contiene (`column`), non sempre uguale: con
 * tre prove una finestra a 85vh era per due terzi vuota. Oltre lo schermo si
 * ferma e scorre solo lo storico, con l'intestazione che resta ferma.
 *
 * Le finestre che si aprono da qui (una prova per intero, le due conferme di
 * eliminazione) stanno in questo file e non nella pagina: partono da
 * dentro questa, e si aprono `elevated` perché sono l'ultima cosa comparsa.
 * La persona da mostrare arriva dalla pagina già aggiornata: eliminando una
 * prova il report si rilegge e i conteggi nell'intestazione cambiano da
 * soli. */

import { useState } from 'react'
import type {
  ConversationReport,
  SimulationAttemptReport,
  UserActivityReport,
} from '../services/admin'
import { getInitials, ROLE_BADGE_CLASSES, ROLE_LABELS } from '../services/auth'
import Badge from './Badge'
import ConversationDetailModal from './ConversationDetailModal'
import type { ConversationDetailTarget } from './ConversationDetailModal'
import DeleteAttemptDialog from './DeleteAttemptDialog'
import DeleteConversationDialog from './DeleteConversationDialog'
import ModalShell from './ModalShell'
import { useModalTitleId } from './modalTitle'
import SimulationAttemptModal from './SimulationAttemptModal'
import UserReportDetail from './UserReportDetail'

/* L'intestazione sta in un componente suo perché è lei a dire alla scatola
 * qual è il titolo della finestra, e `useModalTitleId` va chiamato da dentro
 * la scatola. Stessa forma della riga che l'ha aperta: iniziali, nome ed
 * email, con il ruolo e l'organizzazione accanto. */
function ReportHeader({ user, showOrg }: { user: UserActivityReport; showOrg: boolean }) {
  const titleId = useModalTitleId()
  const fullName = user.nome && user.cognome ? `${user.nome} ${user.cognome}` : user.email

  return (
    // pr-16 tiene il testo lontano dalla X in alto a destra
    <header className="flex items-center gap-4 border-b border-white/6 px-8 py-5 pr-16 max-[480px]:px-5">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 text-sm font-bold text-white">
        {getInitials(user.nome, user.cognome, user.email)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={titleId} className="truncate font-heading text-xl font-bold text-slate-100">
            {fullName}
          </h2>
          <Badge tone={ROLE_BADGE_CLASSES[user.ruolo] ?? ''}>
            {ROLE_LABELS[user.ruolo] ?? user.ruolo}
          </Badge>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span className="truncate">{user.email}</span>
          {showOrg && user.organization_name && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{user.organization_name}</span>
            </>
          )}
        </p>
      </div>
    </header>
  )
}

export default function UserReportModal({
  user,
  days,
  showOrg,
  onClose,
}: {
  user: UserActivityReport
  /** Il periodo scelto in cima alla pagina, che taglia le prove come taglia
   *  i conteggi della riga. */
  days?: number
  /** Se scrivere l'organizzazione accanto al nome: chi ne amministra una
   *  sola la conosce già. */
  showOrg: boolean
  onClose: () => void
}) {
  const [openAttemptId, setOpenAttemptId] = useState<string | null>(null)
  const [openConversation, setOpenConversation] = useState<ConversationDetailTarget | null>(null)
  const [deletingConversation, setDeletingConversation] = useState<ConversationReport | null>(null)
  const [deletingAttempt, setDeletingAttempt] = useState<SimulationAttemptReport | null>(null)

  return (
    <ModalShell
      onClose={onClose}
      size="full"
      padding="none"
      layout="column"
      closeLabel="Chiudi report attività"
    >
      <ReportHeader user={user} showOrg={showOrg} />

      <div className="flex-1 overflow-y-auto px-8 py-6 max-[480px]:px-5">
        <UserReportDetail
          user={user}
          days={days}
          /* Quante prove ha in tutto, per non offrire un quadro d'insieme
             che il server rifiuterebbe. Solo sul periodo "Sempre": su un
             periodo stretto il conto della riga sono le prove di quella
             settimana, mentre il quadro le legge tutte, e chi ne aveva
             venti in un anno si vedeva negare il bottone. Sconosciuto vuol
             dire mostrarlo e lasciar rispondere il server. */
          evidenceCount={
            days === undefined ? user.conversation_count + user.simulation_count : null
          }
          onOpenAttempt={setOpenAttemptId}
          /* La modale della conversazione vuole sapere chi ha parlato con
             chi: l'intestazione arriva da qui, il resto lo carica lei
             dall'id. */
          onOpenConversation={(conversation) =>
            setOpenConversation({
              conversation_id: conversation.id,
              mode: conversation.mode,
              user_nome: user.nome,
              user_cognome: user.cognome,
              user_email: user.email,
              avatar_name: conversation.avatar_name,
              conversation_at: conversation.created_at,
            })
          }
          onDeleteConversation={setDeletingConversation}
          onDeleteAttempt={setDeletingAttempt}
        />
      </div>

      {openAttemptId && (
        <SimulationAttemptModal
          attemptId={openAttemptId}
          elevated
          onClose={() => setOpenAttemptId(null)}
          onDeleted={() => setOpenAttemptId(null)}
        />
      )}

      {/* La conversazione per intero: trascrizione, valutazione e la
          revisione che il docente può scrivere di lì. È la stessa schermata
          della dashboard, perché è la stessa cosa che si va a leggere. */}
      {openConversation && (
        <ConversationDetailModal
          row={openConversation}
          elevated
          onClose={() => setOpenConversation(null)}
          /* Niente `onReviewSaved`: correggere un voto invalida già i
             rendiconti da dentro la mutation, e una query attiva invalidata
             si rilegge da sola. Chiedere anche di qui voleva dire far
             partire due volte la lettura più pesante dell'applicazione. */
          /* Le due prove si possono anche buttare da aperte, ed è lo stesso
             gesto del cestino sulla riga: chi ha appena letto la
             trascrizione è già dentro la conversazione che vuole togliere,
             e non deve richiuderla per cercarne la riga. */
          onDeleted={() => setOpenConversation(null)}
        />
      )}

      {/* Le due conferme di eliminazione, le stesse che si aprono dal
          cestino in testa alle schermate qui sopra. L'eliminazione invalida
          i rendiconti, cioè sia l'elenco della pagina sia le prove di qui,
          che si rileggono dal server. */}
      {deletingConversation && (
        <DeleteConversationDialog
          conversationId={deletingConversation.id}
          avatarName={deletingConversation.avatar_name}
          conversationAt={deletingConversation.created_at}
          elevated
          onClose={() => setDeletingConversation(null)}
          onDeleted={() => setDeletingConversation(null)}
        />
      )}

      {deletingAttempt && (
        <DeleteAttemptDialog
          attemptId={deletingAttempt.id}
          simulationTitle={deletingAttempt.simulation_title}
          simulationKind={deletingAttempt.simulation_kind}
          attemptedAt={deletingAttempt.created_at}
          elevated
          onClose={() => setDeletingAttempt(null)}
          onDeleted={() => setDeletingAttempt(null)}
        />
      )}
    </ModalShell>
  )
}
