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
 * `aria-hidden` perché non aggiunge niente: il numero della domanda e il
 * totale sono scritti in lettere subito sotto, e chi legge con la voce li
 * sente già da lì.
 */
export default function SimulationProgress({
  /** Quante domande sono state consegnate, cioè quella a schermo contata da 0. */
  answered,
  total,
}: {
  answered: number
  total: number
}) {
  return (
    <div className="mb-3 flex items-center gap-1" aria-hidden>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={`h-1 flex-1 rounded-full transition-colors ${
            index < answered
              ? 'bg-violet-600'
              : index === answered
                ? 'bg-violet-500/45'
                : 'bg-white/8'
          }`}
        />
      ))}
    </div>
  )
}
