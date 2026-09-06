/* I requisiti della password che si accendono man mano che vengono
 * soddisfatti.
 *
 * Erano scritti due volte, identici, nella modale di accesso e nella pagina
 * del profilo: gli stessi due posti in cui si sceglie una password, cioè gli
 * stessi due posti in cui una regola aggiunta a `PASSWORD_RULES` doveva
 * comparire, e in uno dei due si sarebbe presentata diversa.
 *
 * Il pallino pieno o vuoto invece di una spunta: la riga dice se il requisito
 * è già rispettato, non se c'è un errore, e un elenco di crocette rosse su
 * una password che si sta ancora scrivendo sarebbe un rimprovero anticipato. */

import type { PasswordRule } from '../services/auth'
import { PASSWORD_RULES } from '../services/auth'

interface PasswordRulesProps {
  password: string
  /* La conferma, dove il modulo ne chiede una. Passarla aggiunge in fondo la
     riga sulla coincidenza fra i due campi: è un requisito come gli altri per
     chi sta scegliendo la password, e sta nello stesso elenco invece che solo
     come errore a campo lasciato. Chi non ha un secondo campo la omette e
     l'elenco resta quello della sola politica. */
  confirmation?: string
}

export default function PasswordRules({ password, confirmation }: PasswordRulesProps) {
  const rules: PasswordRule[] =
    confirmation === undefined
      ? PASSWORD_RULES
      : [
          ...PASSWORD_RULES,
          {
            label: 'Le due password coincidono',
            test: (pw) => pw !== '' && pw === confirmation,
          },
        ]

  return (
    <div className="rounded-xl border border-white/6 bg-white/3 px-4 py-2">
      <p className="mb-1 text-xs font-semibold text-slate-400">Requisiti password:</p>
      <ul className="flex list-none flex-col gap-1">
        {rules.map((rule) => {
          const met = rule.test(password)
          return (
            <li
              key={rule.label}
              className={`text-xs transition-colors ${met ? 'text-emerald-500' : 'text-slate-500'}`}
            >
              <span className="mr-2">{met ? '●' : '○'}</span>
              {rule.label}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
