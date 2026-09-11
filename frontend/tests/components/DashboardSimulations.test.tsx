import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import DashboardSimulations from '../../src/components/DashboardSimulations'
import type { SimulationReportRow } from '../../src/services/admin'

/* Il filtro per tipo di test, che è la cosa che questa sezione fa e nessun
 * altro può controllare al posto suo.
 *
 * Il selettore vive nella barra in cima alla dashboard, ma quello che il
 * valore scelto significa vive qui: scopa i KPI, le medie e la tabella prima
 * di ogni conto. Un filtro che restringesse la sola tabella lascerebbe in
 * cima un voto medio che parla di altri test, ed è il tipo di errore che
 * nessuno nota finché non prende una decisione sbagliata.
 *
 * A crocette un dieci e un cinque, per iscritto due sei: le medie dei due
 * tipi sono diverse fra loro e diverse dalla media di tutto, quindi il numero
 * in cima dice da solo quale filtro è attivo. */

function row(over: Partial<SimulationReportRow> & { attempt_id: string }): SimulationReportRow {
  return {
    simulation_id: 'sim-multipla',
    simulation_title: 'Procedure di sportello',
    simulation_kind: 'multiple',
    simulation_source: 'ai',
    user_id: 'u1',
    user_email: 'tizio@example.com',
    user_nome: 'Tizio',
    user_cognome: 'Rossi',
    organization_id: 'org-1',
    organization_name: 'Organizzazione',
    attempted_at: '2026-02-01T10:00:00Z',
    correct_count: 10,
    question_count: 10,
    score: 10,
    ...over,
  }
}

const rows: SimulationReportRow[] = [
  row({ attempt_id: 'a1', score: 10 }),
  row({ attempt_id: 'a2', score: 5, correct_count: 5 }),
  row({
    attempt_id: 'a3',
    simulation_id: 'sim-aperta',
    simulation_title: 'Rimborsi allo sportello',
    simulation_kind: 'open',
    simulation_source: 'manual',
    score: 6,
    correct_count: 6,
  }),
  row({
    attempt_id: 'a4',
    simulation_id: 'sim-aperta',
    simulation_title: 'Rimborsi allo sportello',
    simulation_kind: 'open',
    simulation_source: 'manual',
    score: 6,
    correct_count: 6,
  }),
]

/** Le scelte che stanno nella pagina e qui arrivano già fatte. */
const scelte = { compareIds: [] as string[], onCompareChange: () => {}, needsOrganization: false }

/** Il voto medio, che è il primo numero in cima alla sezione. */
function averageShown() {
  return screen.getByText('Voto Medio dei Test').closest('div')?.textContent
}

describe('DashboardSimulations, filtro per tipo', () => {
  it('con entrambi i tipi conta tutti i tentativi', () => {
    render(<DashboardSimulations rows={rows} selectedUserId="" kindFilter="all" {...scelte} />)

    // (10 + 5 + 6 + 6) / 4
    expect(averageShown()).toContain('6,8')
    expect(screen.getByText('Test Consegnati').closest('div')?.textContent).toContain('4')
    // Ogni titolo compare due volte, nella barra delle medie e in tabella
    expect(screen.getAllByText('Rimborsi allo sportello').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Procedure di sportello').length).toBeGreaterThan(0)
  })

  it('su un tipo solo, medie e tabella parlano soltanto di quello', () => {
    render(<DashboardSimulations rows={rows} selectedUserId="" kindFilter="open" {...scelte} />)

    // I due test scritti, non i due a crocette
    expect(averageShown()).toContain('6')
    expect(screen.getByText('Test Consegnati').closest('div')?.textContent).toContain('2')
    expect(screen.queryByText('Procedure di sportello')).not.toBeInTheDocument()
  })

  it('il tipo restringe anche il confronto fra utenti', () => {
    /* Il filtro utente evidenzia soltanto, il tipo no: è la prova di cui si
     * sta parlando, e una barra che tenesse dentro i test dell'altro tipo
     * direbbe di quell'utente un numero che non esiste. */
    render(<DashboardSimulations rows={rows} selectedUserId="" kindFilter="multiple" {...scelte} />)

    const confronto = screen.getByRole('region', { name: 'Confronto tra Utenti' })
    expect(within(confronto).getByText('2 tentativi')).toBeInTheDocument()
  })

  it('quando il filtro non lascia niente lo dice, invece di sembrare vuoto', () => {
    const soloMultiple = rows.filter((r) => r.simulation_kind === 'multiple')
    render(
      <DashboardSimulations rows={soloMultiple} selectedUserId="" kindFilter="open" {...scelte} />,
    )

    expect(
      screen.getByText(/Seleziona un altro tipo per visualizzare i dati disponibili/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/ancora consegnato/)).not.toBeInTheDocument()
  })

  it('senza nessun tentativo il messaggio resta quello di prima', () => {
    render(<DashboardSimulations rows={[]} selectedUserId="" kindFilter="all" {...scelte} />)

    expect(screen.getByText(/Nessun test tecnico ancora consegnato/)).toBeInTheDocument()
  })
})

describe('DashboardSimulations, confronto fra utenti', () => {
  /* Lo stesso comando della metà parlata: si scelgono le persone da mettere
   * a confronto, e il grafico resta di loro. Senza scelte resta di tutti. */
  const dueUtenti: SimulationReportRow[] = [
    row({ attempt_id: 'b1', user_id: 'u1', user_nome: 'Anna', user_cognome: 'Zanetti', score: 9 }),
    row({
      attempt_id: 'b2',
      user_id: 'u2',
      user_email: 'zeno@example.com',
      user_nome: 'Zeno',
      user_cognome: 'Abate',
      score: 4,
      correct_count: 4,
    }),
  ]

  it('senza scelte disegna tutte le persone, dalla media più alta', () => {
    render(<DashboardSimulations rows={dueUtenti} selectedUserId="" kindFilter="all" {...scelte} />)

    const confronto = screen.getByRole('region', { name: 'Confronto tra Utenti' })
    const barre = within(confronto)
      .getAllByText(/Anna Zanetti|Zeno Abate/)
      .map((n) => n.textContent)
    expect(barre).toEqual(['Anna Zanetti', 'Zeno Abate'])
  })

  it('con una scelta il grafico è delle persone scelte', () => {
    render(
      <DashboardSimulations
        rows={dueUtenti}
        selectedUserId=""
        kindFilter="all"
        {...scelte}
        compareIds={['u2']}
      />,
    )

    const confronto = screen.getByRole('region', { name: 'Confronto tra Utenti' })
    expect(within(confronto).getByText('Zeno Abate')).toBeInTheDocument()
    expect(within(confronto).queryByText('Anna Zanetti')).not.toBeInTheDocument()
    expect(within(confronto).getByText(/fra le persone scelte/)).toBeInTheDocument()
  })

  it('la tendina elenca le persone per cognome e riporta la scelta alla pagina', async () => {
    const onCompareChange = vi.fn()
    render(
      <DashboardSimulations
        rows={dueUtenti}
        selectedUserId=""
        kindFilter="all"
        {...scelte}
        onCompareChange={onCompareChange}
      />,
    )

    await userEvent.click(screen.getByPlaceholderText(/persone da confrontare/))
    const voci = screen.getAllByRole('option').map((o) => o.textContent)
    expect(voci[0]).toContain('Zeno Abate')
    expect(voci[1]).toContain('Anna Zanetti')

    await userEvent.click(screen.getByRole('option', { name: /Anna Zanetti/ }))
    expect(onCompareChange).toHaveBeenCalledWith(['u1'])
  })

  it('finché il super admin guarda tutte le organizzazioni il comando non c’è', () => {
    render(
      <DashboardSimulations
        rows={dueUtenti}
        selectedUserId=""
        kindFilter="all"
        {...scelte}
        needsOrganization
      />,
    )

    expect(screen.getByText(/Scegli una organizzazione qui sopra/)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/persone da confrontare/)).not.toBeInTheDocument()
  })
})
