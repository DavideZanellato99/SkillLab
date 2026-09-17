import CheckboxField from './CheckboxField'

/* La spunta con cui chi amministra decide se il test registra lo schermo.
 *
 * Compare in due posti, alla creazione e fra i dati di un test già creato,
 * con le stesse parole: è l'unica scelta della creazione che si può cambiare
 * dopo, e due frasi diverse per la stessa spunta sembrerebbero due
 * impostazioni. La frase dice a chi la mette le due cose che deve sapere:
 * che vale per tutti quelli che svolgono il test, e che chi svolge il test
 * lo saprà prima di cominciare. */

export default function SimulationScreenRecordingField({
  id,
  checked,
  onChange,
  disabled = false,
}: {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <CheckboxField
      id={id}
      label="Registra lo schermo durante il test"
      description="Lo schermo intero di chi svolge il test viene registrato dall'avvio alla consegna, e la registrazione è consultabile dal dettaglio del tentativo. Chi svolge il test ne viene informato prima di iniziare e deve consentire la condivisione dello schermo."
      checked={checked}
      onChange={onChange}
      disabled={disabled}
    />
  )
}
