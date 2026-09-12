/* A che punto è il test, disegnato: un trattino per domanda.
 *
 * "Domanda 3 di 10" c'è già in cima al passo, ma è una riga di testo piccolo
 * fra le altre, e durante un test si guarda la domanda e non l'intestazione.
 * Qui la stessa cosa si legge senza leggerla, come la barra del tempo dentro
 * la scelta multipla: quanto manca alla fine è la ragione per cui si decide
 * se rispondere di getto o con calma.
 *
 * Sta fuori dal riquadro della domanda e non dentro, e per due motivi. È del
 * test e non della domanda, quindi non appartiene a un passo che si rimonta a
 * ogni risposta; e nella scelta multipla dentro al riquadro ci sarebbe già la
 * barra del tempo, cioè due barre a un centimetro l'una dall'altra che
 * misurano cose diverse. A trattini invece che continua per lo stesso motivo:
 * di lontano non si confonde con quella che scende da sola.
 *
 * Sui test senza cronometro i trattini sono anche il modo di tornare su una
 * domanda: ognuno di quelli già raggiunti è un pulsante, e premerlo la
 * rimette a schermo. Sono quattro stati e non tre, perché con il ritorno
 * indietro "prima di questa" non vuol più dire "risposta": una domanda si
 * può aver vista e lasciata in bianco, e va distinta da una mai raggiunta,
 * che è l'unica su cui non si può andare.
 *
 * Quando i trattini non si premono, cioè sulla scelta multipla, la fila è
 * `aria-hidden` perché non aggiunge niente: il numero della domanda e il
 * totale sono scritti in lettere subito sotto, e chi legge con la voce li
 * sente già da lì. Quando si premono no: sono comandi, e ogni pulsante dice
 * a quale domanda porta.
 */

/** Cosa si sa di una domanda, vista dalla barra. */
export type ProgressMark =
  /** Ha una risposta. */
  | 'done'
  /** È quella a schermo. */
  | 'current'
  /** È stata vista e lasciata senza risposta. */
  | 'seen'
  /** Non è ancora comparsa. */
  | 'todo'

const DASH_CLS: Record<ProgressMark, string> = {
  done: 'bg-violet-600 group-hover:bg-violet-400',
  current: 'bg-violet-500/45',
  seen: 'bg-white/20 group-hover:bg-white/35',
  todo: 'bg-white/8',
}

export default function SimulationProgress({
  marks,
  onSelect,
}: {
  /** Un segno per domanda, nell'ordine del test. */
  marks: ProgressMark[]
  /** Porta alla domanda premuta. Assente dove non si torna indietro. */
  onSelect?: (index: number) => void
}) {
  const dash = (mark: ProgressMark) => (
    <span className={`block h-1 w-full rounded-full transition-colors ${DASH_CLS[mark]}`} />
  )

  if (!onSelect) {
    return (
      <div className="mb-3 flex items-center gap-1" aria-hidden>
        {marks.map((mark, index) => (
          <span key={index} className="flex-1">
            {dash(mark)}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="mb-1 flex items-center gap-1">
      {marks.map((mark, index) =>
        mark === 'todo' ? (
          /* Una domanda mai comparsa non si può raggiungere: arriverà quando
             sarà il suo turno. Lo spazio verticale è lo stesso dei pulsanti,
             o la fila avrebbe trattini a due altezze. */
          <span key={index} className="flex-1 py-2" aria-hidden>
            {dash(mark)}
          </span>
        ) : (
          /* L'imbottitura sopra e sotto è per il dito e per il mouse: un
             trattino alto un pixel non è un bersaglio. */
          <button
            key={index}
            type="button"
            onClick={() => onSelect(index)}
            aria-label={`Vai alla domanda ${index + 1}`}
            aria-current={mark === 'current' ? 'step' : undefined}
            className="group flex-1 cursor-pointer py-2"
          >
            {dash(mark)}
          </button>
        ),
      )}
    </div>
  )
}
