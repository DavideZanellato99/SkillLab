import TabBar from './TabBar'

/* La linguetta con cui, dentro una sezione del confronto, si sceglie la prova
 * di cui si parla: una conversazione valutata o un test tecnico, una per
 * volta, perché il miglioramento in una non dice niente dell'altra.
 *
 * Un componente e non due copie perché le due sezioni della pagina, il
 * confronto tra tentativi e quello tra utenti, la portano tutte e due con le
 * stesse parole: scritta due volte una avrebbe finito per dire "Test tecnici"
 * e l'altra "Simulazioni tecniche". Stava in cima alla pagina e valeva per
 * entrambi i riquadri; da quando le due sezioni sono due linguette, ognuna ha
 * la propria, e la scelta resta comunque una sola nell'indirizzo (`prova=`),
 * così passando da una sezione all'altra si resta sulla stessa prova.
 *
 * Solo il nome della prova, senza il conteggio accanto: nel confronto tra
 * tentativi c'era, e quante prove ha la persona scelta si legge nell'elenco
 * appena sotto. */

export type ComparisonProva = 'conversazioni' | 'simulazioni'

export default function ComparisonProvaTabs({
  base,
  value,
  onChange,
}: {
  /** La radice degli id, la stessa del `TabPanel` che sta sotto. */
  base: string
  value: ComparisonProva
  onChange: (value: ComparisonProva) => void
}) {
  return (
    <TabBar
      items={[
        { value: 'conversazioni', label: 'Conversazioni' },
        { value: 'simulazioni', label: 'Simulazioni tecniche' },
      ]}
      value={value}
      onChange={onChange}
      ariaLabel="Prova da confrontare"
      panelBase={base}
    />
  )
}
