/* Il riquadro che compare al posto di un confronto che non si può fare.
 *
 * Le ragioni sono tre e non una: non c'è nessuna prova, ce n'è una sola, o i
 * filtri scelti hanno lasciato meno di due prove. L'ultima è l'unica che chi
 * guarda può risolvere sul momento, quindi va detta come tale invece di
 * riusare il "non c'è niente" delle prime due, che manderebbe a cercare prove
 * che invece esistono.
 *
 * Il suggerimento sotto è la quarta cosa da dire, e vale solo per chi può
 * scegliere una persona: un admin atterra sulle proprie prove, che sono
 * quasi sempre zero, e il riquadro da solo gli direbbe che non c'è niente da
 * confrontare mentre le prove della sua gente sono a un gesto di distanza.
 * Sta in fondo e in tono minore perché è cosa fare, non cosa è successo.
 *
 * Uguale in tutte e due le metà perché è la stessa frase in due posti: le
 * conversazioni e i test tecnici si svuotano allo stesso modo. */
export default function ComparisonEmpty({
  children,
  hint,
}: {
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="rounded-2xl border border-white/6 bg-white/4 p-12 text-center">
      <p className="text-sm text-slate-500">{children}</p>
      {hint && <p className="mt-2 text-[0.8rem] text-slate-600">{hint}</p>}
    </div>
  )
}
