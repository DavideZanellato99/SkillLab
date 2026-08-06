import DetailModal, { DetailField } from './DetailModal'
import AuthorshipFields from './AuthorshipFields'
import Badge from './Badge'
import SimulationKindBadge from './SimulationKindBadge'
import SimulationSourceBadge from './SimulationSourceBadge'
import { statusBadgeTone, statusLabel } from './simulationFormat'
import { QUESTION_COUNT, requiredPool } from '../services/simulations'
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
  onClose,
}: {
  simulation: AdminSimulation
  onClose: () => void
}) {
  const required = requiredPool(simulation.source)
  return (
    <DetailModal onClose={onClose} title={simulation.title} subtitle={simulation.organization_name}>
      <DetailField label="Stato">
        <Badge tone={statusBadgeTone(simulation.status)}>{statusLabel(simulation.status)}</Badge>
      </DetailField>
      {/* Il tipo non si cambia dopo la creazione, quindi qui è una cosa da
          sapere e non un campo che qualcuno andrà a cercare per modificarlo. */}
      <DetailField label="Tipo di test">
        <SimulationKindBadge kind={simulation.kind} />
      </DetailField>
      <DetailField label="Organizzazione">{simulation.organization_name}</DetailField>
      {/* Chi ha scritto le domande, e da cosa. Le due righe sono la stessa
          informazione vista da due lati, quindi su un test scritto a mano il
          documento non compare vuoto: non ce n'è uno. */}
      <DetailField label="Origine domande">
        <SimulationSourceBadge source={simulation.source} />
      </DetailField>
      {simulation.source !== 'manual' && (
        <DetailField label="Documento">{simulation.document_name}</DetailField>
      )}
      <DetailField label="Descrizione">
        {simulation.description || <span className="text-slate-500">Nessuna descrizione</span>}
      </DetailField>
      {/* Quante ne mancano al serbatoio è la sola cosa che tiene una
          simulazione in bozza, quindi finché ne mancano si legge quante ne
          servono. Quando ci sono si legge l'altro numero, quante ne vedrà chi
          svolge il test, senza il quale "50 domande" farebbe pensare a un
          test lunghissimo. La soglia dipende da chi le ha scritte: cinquanta
          se le genera il modello, dieci se le scrive una persona. */}
      <DetailField label="Domande">
        <div>{simulation.question_count}</div>
        {simulation.question_count < required ? (
          <div className="text-xs text-slate-500">
            Ne servono {required} per pubblicare, non è pubblicabile finché non ci sono
          </div>
        ) : (
          <div className="text-xs text-slate-500">
            Ogni tentativo ne estrae {QUESTION_COUNT} a caso
          </div>
        )}
      </DetailField>
      <AuthorshipFields row={simulation} />
      <DetailField label="ID simulazione" mono>
        {simulation.id}
      </DetailField>
    </DetailModal>
  )
}
