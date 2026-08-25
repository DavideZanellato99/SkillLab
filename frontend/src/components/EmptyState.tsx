import type { ReactNode } from 'react'

/* Il riquadro che occupa il posto di un elenco che non ha niente dentro.
 *
 * Era ricopiato riga per riga in cinque schermate, e in una di esse si era già
 * fatto una costante locale: stessa cornice, stesso fondo, stessa spaziatura,
 * scritti cinque volte. È lo stesso riquadro, e chi cambia il grigio lo deve
 * cambiare una volta sola. Stessa ragione per cui i banner di errore stanno in
 * `FormError` e i gruppi di linguette in `FilterTabs`.
 *
 * Due righe e non una: la prima dice cosa manca, la seconda perché manca o
 * cosa farebbe comparire qualcosa. La seconda è facoltativa, perché dove non
 * c'è niente da fare (un percorso che non è più tuo) una frase in più sarebbe
 * una consolazione, non un'informazione.
 *
 * Il punto finale non c'è, in nessuna delle due: gli stati vuoti dell'app non
 * lo mettono, a differenza degli errori e delle descrizioni. */
export default function EmptyState({
  title,
  hint,
}: {
  /** Cosa non c'è. */
  title: ReactNode
  /** Perché non c'è, o cosa lo riempirebbe. */
  hint?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-white/6 bg-gray-900/60 p-16 text-center text-slate-500 backdrop-blur-md max-md:p-8">
      <p className="text-[0.95rem]">{title}</p>
      {hint && <p className="mt-1 text-sm">{hint}</p>}
    </div>
  )
}
