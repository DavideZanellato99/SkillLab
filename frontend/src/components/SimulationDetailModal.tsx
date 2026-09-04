import DetailModal, { DetailField } from './DetailModal'
import AuthorshipFields from './AuthorshipFields'
import Badge from './Badge'
import SimulationKindBadge from './SimulationKindBadge'
import SimulationSourceBadge from './SimulationSourceBadge'
import { statusBadgeTone, statusLabel } from './simulationFormat'
import { requiredPool } from '../services/simulations'
import type { AdminSimulation } from '../services/simulations'

/* Scheda di sola lettura di una simulazione, aperta dal clic sulla riga della
 * tabella. È la stessa modale del dettaglio di un utente, di un'organizzazione
 * e di un avatar (DetailModal + DetailField): cambiano i campi, non il modo di
 * mostrarli.
 *
 * Le domande non si leggono qui: stanno nel pannello di revisione, che è anche
 * l'unico posto in cui si scrivono, e ricopiarle vorrebbe dire tenere
 * allineati due posti. Qui resta quante ne sono state scritte, che è quanto
 * basta per capire a che punto è il test. */

export default function SimulationDetailModal({
  simulation,
  showOrganization = true,
  onClose,
}: {
  simulation: AdminSimulation
  /** Falso per chi ne amministra una sola: sarebbe la sua, scritta due volte. */
  showOrganization?: boolean
  onClose: () => void
}) {
  const required = requiredPool(simulation.source)
  return (
    <DetailModal
      onClose={onClose}
      title={simulation.title}
      subtitle={showOrganization ? simulation.organization_name : undefined}
    >
      <DetailField label="Stato">
        <Badge tone={statusBadgeTone(simulation.status)}>{statusLabel(simulation.status)}</Badge>
      </DetailField>
      {/* Il tipo non si cambia dopo la creazione, quindi qui è una cosa da
          sapere e non un campo che qualcuno andrà a cercare per modificarlo. */}
      <DetailField label="Tipo di Test">
        <SimulationKindBadge kind={simulation.kind} />
      </DetailField>
      {showOrganization && (
        <DetailField label="Organizzazione">{simulation.organization_name}</DetailField>
      )}
      {/* Chi ha scritto le domande, e da cosa. Le due righe sono la stessa
          informazione vista da due lati, quindi su un test scritto a mano il
          documento non compare vuoto: non ce n'è uno. */}
      <DetailField label="Origine Domande">
        <SimulationSourceBadge source={simulation.source} />
      </DetailField>
      {simulation.source !== 'manual' && (
        <DetailField label="Documento">{simulation.document_name}</DetailField>
      )}
      {/* La descrizione è l'unico campo lungo della scheda: allineata a destra
          come gli altri si leggerebbe con il bordo sinistro frastagliato, e
          giustificata torna un blocco di testo. Quando non c'è resta la riga
          allineata come le altre, perché sono due parole. */}
      <DetailField label="Descrizione">
        {simulation.description ? (
          <div className="text-justify">{simulation.description}</div>
        ) : (
          <span className="text-slate-500">Nessuna descrizione</span>
        )}
      </DetailField>
      {/* Quante ne mancano al serbatoio è la sola cosa che tiene una
          simulazione in bozza, quindi finché ne mancano si legge quante ne
          servono e quando ci sono non si legge niente: il serbatoio completo
          è la normalità e non una notizia. La soglia dipende da chi le ha
          scritte: cinquanta se le genera il modello, dieci se le scrive una
          persona. */}
      <DetailField label="Domande">
        <div>{simulation.question_count}</div>
        {simulation.question_count < required && (
          <div className="text-xs text-slate-500">
            Ne servono {required} per pubblicare, non è pubblicabile finché non ci sono
          </div>
        )}
      </DetailField>
      <AuthorshipFields row={simulation} />
      <DetailField label="ID Simulazione" mono>
        {simulation.id}
      </DetailField>
    </DetailModal>
  )
}
