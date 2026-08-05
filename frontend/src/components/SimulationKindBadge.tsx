import type { SimulationKind } from '../services/simulations'
import { kindLabel } from './simulationFormat'

/**
 * Come si rispondeva a un test: scegliendo fra alternative o scrivendo.
 *
 * Il gemello di `ConversationModeBadge`, e non per somiglianza: là due
 * conversazioni si leggono nella stessa tabella e una è al telefono e l'altra
 * scritta, qui due tentativi si leggono nella stessa tabella e uno è a
 * crocette con il cronometro e l'altro a risposte scritte giudicate da un
 * modello. In entrambi i casi il voto da solo non dice quale prova era, e due
 * prove diverse non si confrontano senza saperlo.
 *
 * I colori sono gli stessi dell'altro badge e vogliono dire la stessa cosa:
 * violetto dove si sceglie o si parla, ciano dove si scrive.
 *
 * Con `iconOnly` resta il solo disegno, per i posti fitti come la tabella
 * della dashboard. La parola resta nel markup per chi legge con uno screen
 * reader, e il titolo al passaggio del mouse la scrive per esteso comunque.
 */
export default function SimulationKindBadge({
  kind,
  iconOnly = false,
}: {
  kind: SimulationKind
  iconOnly?: boolean
}) {
  const isOpen = kind === 'open'
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border text-[0.62rem] font-semibold uppercase tracking-wider ${
        iconOnly ? 'p-1' : 'gap-1 px-2 py-0.5'
      } ${
        isOpen
          ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
          : 'border-violet-600/35 bg-violet-600/10 text-violet-400'
      }`}
      title={
        isOpen
          ? 'Test a risposta aperta: si scrive, e i punti dicono quanto la risposta è completa'
          : 'Test a scelta multipla: una fra quattro alternative, a tempo'
      }
    >
      {isOpen ? (
        /* Una matita: qui si scrive */
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      ) : (
        /* Il pallino da selezionare: qui si sceglie */
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="9" strokeWidth="2.5" />
          <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
        </svg>
      )}
      <span className={iconOnly ? 'sr-only' : undefined}>{kindLabel(kind)}</span>
    </span>
  )
}
