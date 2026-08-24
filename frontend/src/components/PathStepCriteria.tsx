import { useId } from 'react'

import type { AssignableContent, CriteriaTargets } from '../services/training'
import { formInputCls, labelCls } from './Field'
import NumberInput from './NumberInput'

/* Le soglie sui singoli criteri di una tappa di conversazione.
 *
 * Servono a una cosa che il solo voto complessivo non sa fare: il voto è una
 * media pesata dei sei criteri, quindi un criterio andato male lo coprono gli
 * altri cinque, e una tappa che allena l'empatia si supera lo stesso restando
 * freddi. Una soglia sul criterio è la condizione che quella media non può
 * assorbire.
 *
 * Si compilano una per una e quasi sempre sono una o due: si scrive il numero
 * sui criteri che quella tappa allena e si lascia vuoto tutto il resto, che è
 * il motivo per cui il pannello sta chiuso finché non lo si apre. Sei campi
 * aperti su ogni riga direbbero che vanno riempiti, e non vanno riempiti.
 *
 * Il campo vuoto e lo zero sono due cose diverse e non si possono confondere:
 * vuoto vuol dire che il criterio non è una condizione, zero sarebbe una
 * condizione soddisfatta da chiunque. Svuotare il campo toglie la soglia
 * (vedi `withCriterionTarget`).
 *
 * I criteri, i nomi e i pesi arrivano dal server insieme al catalogo delle
 * prove: sono gli stessi su cui il giudizio viene dato, e chi compone la
 * tappa deve leggere le parole che poi leggerà nel referto.
 *
 * I nomi stanno per esteso e uno per riga, non accorciati in una griglia di
 * colonne strette: qui si decide una condizione su un percorso, e
 * "Linguaggio" o "Casistica" sono etichette che si riconoscono solo dopo
 * averle già imparate altrove. Sei righe alte quanto un campo occupano lo
 * spazio di un pannello che si apre apposta, mentre un nome tagliato a metà
 * costa una lettura in più ogni volta.
 *
 * Accanto al nome non c'è il peso che il criterio ha nella media. Sarebbe un
 * numero che parla di un'altra cosa: qui si scrive una soglia che la media
 * non deve poter assorbire, e quanto quel criterio pesi dentro la media è
 * esattamente quello che la soglia scavalca. Due numeri per riga, uno da
 * leggere e uno da scrivere, si somigliano abbastanza da farsi confondere. */

export default function PathStepCriteria({
  criteria,
  targets,
  onChange,
  disabled = false,
}: {
  criteria: AssignableContent['criteria']
  targets: CriteriaTargets
  /** La soglia di un criterio, o null quando il campo viene svuotato. */
  onChange: (key: string, value: number | null) => void
  disabled?: boolean
}) {
  // Le tappe sono più d'una nella stessa finestra, e i criteri sei per tappa:
  // senza un prefisso per riga, l'etichetta di una punterebbe al campo di
  // un'altra.
  const fieldId = useId()

  return (
    <div className="rounded-xl border border-white/6 bg-white/2 p-3">
      <div className="grid gap-1.5">
        {criteria.map((criterion) => (
          <div key={criterion.key} className="flex items-center justify-between gap-3">
            <label htmlFor={`${fieldId}-${criterion.key}`} className={labelCls}>
              {criterion.label}
            </label>
            <NumberInput
              id={`${fieldId}-${criterion.key}`}
              min={1}
              max={10}
              step={0.5}
              disabled={disabled}
              placeholder="—"
              aria-label={`Obiettivo di ${criterion.label} (1-10)`}
              value={targets[criterion.key] ?? ''}
              onValueChange={(value) =>
                onChange(criterion.key, value === '' ? null : Number(value))
              }
              wrapperClassName="w-24 shrink-0"
              className={`w-full pr-6 pl-6 text-center ${formInputCls}`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
