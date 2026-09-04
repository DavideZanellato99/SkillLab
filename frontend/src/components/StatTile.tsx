import type { ReactNode } from 'react'

/* Un dato solo dentro il suo riquadro: l'etichetta piccola sopra, il valore
 * sotto.
 *
 * Nasce dentro il pannello di una tappa, dove tentativi e scadenza stanno
 * fianco a fianco, e serve identico in cima alle regole di un test, dove
 * stanno quante domande sono e quanto durano. Sono la stessa cosa vista in
 * due schermate, e ricopiarne le misure avrebbe voluto dire due riquadri che
 * si somigliano invece di uno solo.
 *
 * Non ha titolo, e il colore lo mette chi scrive il valore: il pannello di
 * una tappa ci infila il trattino grigio della scadenza che non c'è. */
export default function StatTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/3 px-3 py-2">
      <span className="block text-[0.68rem] uppercase tracking-wider text-slate-500">{label}</span>
      <span className="mt-0.5 block text-[0.9rem] font-semibold text-slate-100">{children}</span>
    </div>
  )
}
