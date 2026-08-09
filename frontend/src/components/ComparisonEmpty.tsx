/* Il riquadro che compare al posto di un confronto che non si può fare.
 *
 * Le ragioni sono tre e non una: non c'è nessuna prova, ce n'è una sola, o i
 * filtri scelti hanno lasciato meno di due prove. L'ultima è l'unica che chi
 * guarda può risolvere sul momento, quindi va detta come tale invece di
 * riusare il "non c'è niente" delle prime due, che manderebbe a cercare prove
 * che invece esistono.
 *
 * Uguale in tutte e due le metà perché è la stessa frase in due posti: le
 * conversazioni e i test tecnici si svuotano allo stesso modo. */
export default function ComparisonEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-white/6 bg-white/4 p-12 text-center text-sm text-slate-500">
      {children}
    </p>
  )
}
