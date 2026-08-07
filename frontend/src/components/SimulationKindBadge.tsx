import type { SimulationKind } from '../services/simulations'
import { kindLabel } from './simulationFormat'
import Tooltip from './Tooltip'

/* Come si risponde a un test, in un colore e un disegno.
 *
 * I quattro tipi si dividono in due famiglie, e i colori dicono quella: dove
 * si sceglie fra cose già scritte il badge è violetto, dove si compone una
 * risposta è ciano. Sono gli stessi due colori di `ConversationModeBadge`, e
 * vogliono dire la stessa cosa. Un terzo e un quarto colore avrebbero reso
 * la riga di una tabella un arcobaleno da decifrare, mentre a distinguere i
 * tipi dentro la famiglia basta il disegno, che è quello che si guarda per
 * secondo.
 *
 * Il disegno racconta il gesto: il pallino da selezionare, la matita che
 * scrive, le righe da riordinare, le due colonne da accoppiare. */
const KIND_STYLES: Record<SimulationKind, { tone: string; tooltip: string }> = {
  multiple: {
    tone: 'border-violet-600/35 bg-violet-600/10 text-violet-400',
    tooltip:
      'Test a scelta multipla: si seleziona una fra le alternative proposte, entro un tempo massimo',
  },
  open: {
    tone: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
    tooltip:
      'Test a risposta aperta: si risponde per iscritto, e il punteggio riflette la completezza della risposta',
  },
  ordering: {
    tone: 'border-violet-600/35 bg-violet-600/10 text-violet-400',
    tooltip:
      "Test di ordinamento: si rimettono i passi di una procedura nell'ordine giusto, e il punteggio è la quota di passi al posto giusto",
  },
  matching: {
    tone: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
    tooltip:
      'Test di abbinamento: si accoppiano gli elementi di due colonne, e il punteggio è la quota di coppie indovinate',
  },
}

function KindIcon({ kind }: { kind: SimulationKind }) {
  const stroke = {
    width: '10',
    height: '10',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2.5',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (kind === 'open') {
    /* Una matita: qui si scrive */
    return (
      <svg {...stroke}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    )
  }
  if (kind === 'ordering') {
    /* Tre righe con le frecce su e giù: qui si sposta */
    return (
      <svg {...stroke}>
        <path d="M4 6h9M4 12h9M4 18h9" />
        <path d="M18 4v16M15 7l3-3 3 3M15 17l3 3 3-3" />
      </svg>
    )
  }
  if (kind === 'matching') {
    /* Due colonne unite da un ponte: qui si accoppia */
    return (
      <svg {...stroke}>
        <path d="M4 7h5M4 17h5M15 7h5M15 17h5" />
        <path d="M9 7h2a2 2 0 0 1 2 2v6a2 2 0 0 0 2 2h0" />
      </svg>
    )
  }
  /* Il pallino da selezionare: qui si sceglie */
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="9" strokeWidth="2.5" />
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </svg>
  )
}

/**
 * Come si rispondeva a un test: la targhetta che sta ovunque ne compaia uno.
 *
 * Il gemello di `ConversationModeBadge`, e non per somiglianza: là due
 * conversazioni si leggono nella stessa tabella e una è al telefono e l'altra
 * scritta, qui quattro tentativi si leggono nella stessa tabella e uno è a
 * crocette con il cronometro, uno a risposte scritte giudicate da un modello,
 * uno a passi da riordinare, uno a colonne da accoppiare. In tutti i casi il
 * voto da solo non dice quale prova era, e due prove diverse non si
 * confrontano senza saperlo.
 *
 * Con `iconOnly` resta il solo disegno, per i posti fitti come la tabella
 * della dashboard. La parola resta nel markup per chi legge con uno screen
 * reader, e il tooltip la scrive per esteso comunque.
 */
export default function SimulationKindBadge({
  kind,
  iconOnly = false,
}: {
  kind: SimulationKind
  iconOnly?: boolean
}) {
  const style = KIND_STYLES[kind] ?? KIND_STYLES.multiple
  return (
    <Tooltip content={style.tooltip}>
      <span
        className={`inline-flex shrink-0 items-center rounded-full border text-[0.62rem] font-semibold uppercase tracking-wider ${
          iconOnly ? 'p-1' : 'gap-1 px-2 py-0.5'
        } ${style.tone}`}
      >
        <KindIcon kind={kind} />
        <span className={iconOnly ? 'sr-only' : undefined}>{kindLabel(kind)}</span>
      </span>
    </Tooltip>
  )
}
