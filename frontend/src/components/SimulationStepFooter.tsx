import PrimaryButton from './PrimaryButton'
import SecondaryButton from './SecondaryButton'

/* Il piè di pagina di una domanda senza cronometro: la nota a sinistra, i
 * comandi a destra.
 *
 * I tre passi senza cronometro (la casella in cui si scrive, i passi da
 * disporre, le due colonne) finivano tutti con la stessa riga, scritta tre
 * volte: una nota e un solo pulsante che diceva "Avanti", "Salta la Domanda"
 * o "Consegna il Test" a seconda di dove si era e di cosa si era fatto.
 * Adesso i pulsanti sono due, perché da una domanda senza cronometro si può
 * tornare a quella prima, e una riga con due pulsanti e tre etichette scritta
 * in tre file era già una copia di troppo.
 *
 * "Indietro" c'è solo se c'è un posto dove tornare, quindi non sulla prima
 * domanda: il chiamante lo dice non passando `onBack`. Sulla scelta multipla
 * non c'è mai, e infatti quel passo non usa questo componente: il cronometro
 * di una domanda già consegnata è finito, e riaprirla vorrebbe dire
 * rimisurarne il tempo.
 *
 * La nota è del passo finché la domanda non ha una risposta, perché dice
 * come si risponde e quello cambia da tipo a tipo. Quando ce l'ha, la nota è
 * la stessa per tutti e sta qui: sull'ultima domanda il pulsante consegna, ed
 * è la consegna il momento che chiude tutto, quindi va detto lì e non prima;
 * prima va detto il contrario, cioè che niente è ancora chiuso. */

interface SimulationStepFooterProps {
  /** La nota a sinistra. Senza, quella di una domanda che ha la risposta. */
  hint?: string
  /** La domanda ha una risposta: cambia l'etichetta di "Avanti". */
  answered: boolean
  isLast: boolean
  onNext: () => void
  /** Torna alla domanda prima. Assente sulla prima domanda. */
  onBack?: () => void
}

export default function SimulationStepFooter({
  hint,
  answered,
  isLast,
  onNext,
  onBack,
}: SimulationStepFooterProps) {
  return (
    <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/6 pt-5">
      <span className="text-xs text-slate-500">
        {hint ??
          (isLast
            ? 'Con la consegna le risposte non sono più modificabili'
            : 'Fino alla consegna puoi tornare su questa domanda e cambiare la risposta')}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        {onBack && (
          <SecondaryButton variant="action" onClick={onBack}>
            Indietro
          </SecondaryButton>
        )}
        <PrimaryButton onClick={onNext}>
          {isLast ? 'Consegna il Test' : answered ? 'Avanti' : 'Salta la Domanda'}
        </PrimaryButton>
      </div>
    </div>
  )
}
