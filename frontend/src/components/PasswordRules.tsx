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

import { PASSWORD_RULES } from '../services/auth'

export default function PasswordRules({ password }: { password: string }) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/3 px-4 py-2">
      <p className="mb-1 text-xs font-semibold text-slate-400">Requisiti password:</p>
      <ul className="flex list-none flex-col gap-1">
        {PASSWORD_RULES.map((rule) => {
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
