import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* La vista dei punteggi: quello che decide da sé, cioè i filtri della vista,
 * e cosa succede quando una delle due metà non c'è.
 *
 * Il periodo e l'organizzazione non sono suoi: arrivano dal guscio della
 * sezione (vedi DashboardPage), che qui si sostituisce con un `Outlet` che
 * passa lo scope scritto dal test.
 *
 * Le due metà hanno i loro test (la sezione scritta in DashboardSimulations,
 * i grafici in scoreCharts): qui si sostituiscono, così il banco resta a
 * quello che la vista decide. */

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useAuth', () => ({ useAuth }))

const useEvaluationsReport = vi.hoisted(() => vi.fn())
const useSimulationsReport = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useReports', () => ({ useEvaluationsReport, useSimulationsReport }))

const fetchEvaluationsReportXlsx = vi.hoisted(() => vi.fn())
vi.mock('../../src/services/admin', () => ({ fetchEvaluationsReportXlsx }))
vi.mock('../../src/services/api', () => ({ saveBlob: vi.fn() }))

vi.mock('../../src/components/DashboardSimulations', () => ({
  default: () => <div>metà scritta</div>,
}))
vi.mock('../../src/components/ConversationDetailModal', () => ({
  default: ({ row }: { row: { conversation_id: string } }) => (
    <div>dettaglio di {row.conversation_id}</div>
  ),
}))

import DashboardScores from '../../src/components/DashboardScores'
import type { DashboardScope } from '../../src/components/dashboardViews'
import type { EvaluationReportRow } from '../../src/services/admin'

function valutazione(over: Partial<EvaluationReportRow> = {}): EvaluationReportRow {
  return {
    conversation_id: 'c-1',
    conversation_title: 'Reclamo carta',
    mode: 'voice',
    user_id: 'u-1',
    user_email: 'anna@test.it',
    user_nome: 'Anna',
    user_cognome: 'Rossi',
    organization_id: 'org-1',
    organization_name: 'Prima org',
    avatar_id: 'a-1',
    avatar_name: 'Cliente arrabbiato',
    conversation_at: '2026-03-01T10:00:00Z',
    evaluated_at: '2026-03-01T10:30:00Z',
    overall_score: 7,
    ai_overall_score: 7,
    has_override: false,
    has_review: false,
    criteria: { ascolto: 7 },
    ...over,
  }
}

const refetchValutazioni = vi.fn()
const refetchTentativi = vi.fn()

/* Cosa rispondono le due letture: pronte e vuote, se non si dice altro.
 *
 * Le etichette per esteso dei criteri arrivano una volta per risposta e non
 * su ogni riga, quindi il vocabolario si costruisce qui accanto alle righe:
 * è la forma che il server manda. */
function reports({
  rows = [] as EvaluationReportRow[],
  criteriaLabels = { ascolto: 'Ascolto attivo' } as Record<string, string>,
  simulations = [] as unknown[],
  truncated = false,
  evaluationsPending = false,
  simulationsPending = false,
  error = null as unknown,
} = {}) {
  useEvaluationsReport.mockReturnValue({
    data: { criteria_labels: criteriaLabels, rows, truncated },
    isPending: evaluationsPending,
    isFetching: false,
    error,
    refetch: refetchValutazioni,
  })
  useSimulationsReport.mockReturnValue({
    data: { rows: simulations, truncated: false },
    isPending: simulationsPending,
    isFetching: false,
    error: null,
    refetch: refetchTentativi,
  })
}

/** L'indirizzo, per leggere dove finiscono le scelte. */
function Indirizzo() {
  const { search } = useLocation()
  return <p data-testid="indirizzo">{search}</p>
}

const indirizzo = () => screen.getByTestId('indirizzo').textContent ?? ''

/** Il guscio della sezione, ridotto a quello che la vista ne riceve. */
function Guscio({ scope }: { scope: DashboardScope }) {
  return <Outlet context={scope} />
}

function renderScores(
  percorso = '/app/admin/dashboard/punteggi',
  scope: DashboardScope = { organizationId: '', days: undefined, period: 'all' },
) {
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <Indirizzo />
      <Routes>
        <Route element={<Guscio scope={scope} />}>
          <Route path="/app/admin/dashboard/punteggi" element={<DashboardScores />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

/** Lo scope di chi ha scelto una organizzazione: il confronto vive lì dentro. */
const DENTRO_UNA_ORG: DashboardScope = {
  organizationId: 'org-1',
  days: undefined,
  period: 'all',
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuth.mockReturnValue({ user: { id: 'admin-1', ruolo: 'super_admin' } })
  reports()
})

describe('i filtri della vista', () => {
  /* Una dashboard è la schermata che si guarda in due davanti allo stesso
   * schermo: senza le scelte nell'indirizzo, un ricaricamento riporta al
   * punto di partenza e un collegamento mandato a qualcuno gli apre
   * un'altra pagina. */
  it('scrive nell’indirizzo il canale scelto', async () => {
    reports({ rows: [valutazione()] })
    renderScores()

    await userEvent.click(screen.getByRole('radio', { name: 'Chat' }))

    expect(indirizzo()).toContain('canale=text')
  })

  /* Il default non si scrive: un indirizzo pieno di parametri che valgono
   * quello che valevano già è un indirizzo che nessuno copia. */
  it('non scrive il valore di partenza', async () => {
    reports({ rows: [valutazione()] })
    renderScores('/app/admin/dashboard/punteggi?canale=text')

    await userEvent.click(screen.getByRole('radio', { name: 'Chiamate' }))

    expect(indirizzo()).not.toContain('canale')
  })

  it('riapre la vista come la si era lasciata', () => {
    reports({ rows: [valutazione()] })
    renderScores('/app/admin/dashboard/punteggi?canale=text&prova=simulazioni')

    expect(screen.getByRole('tab', { name: /Simulazioni tecniche/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('metà scritta')).toBeInTheDocument()
  })

  /* Un valore inventato nell'indirizzo non deve lasciare la vista senza
   * nessuna scelta accesa. */
  it('ignora un canale che non esiste', () => {
    reports({ rows: [valutazione()] })
    renderScores('/app/admin/dashboard/punteggi?canale=piccioni')

    expect(screen.getByRole('radio', { name: 'Chiamate' })).toHaveAttribute('aria-checked', 'true')
  })

  /* Periodo e organizzazione arrivano dal guscio, e da qui vanno alle due
   * letture: sono i filtri che decidono quante righe arrivano. */
  it('porta lo scope del guscio alle due letture', () => {
    reports({ rows: [valutazione()] })
    renderScores('/app/admin/dashboard/punteggi', {
      organizationId: 'org-1',
      days: 30,
      period: '30',
    })

    expect(useEvaluationsReport).toHaveBeenCalledWith('org-1', 30, true)
    expect(useSimulationsReport).toHaveBeenCalledWith('org-1', 30, true)
  })

  it('senza periodo scelto chiede tutto lo storico', () => {
    renderScores()

    expect(useEvaluationsReport).toHaveBeenCalledWith('', undefined, true)
  })
})

describe('le due metà della vista', () => {
  /* La linguetta che si sta guardando disegna appena i suoi dati sono
   * pronti: prima aspettava anche la scansione dell'altra prova, che è una
   * query a parte e più lenta. */
  it('disegna la metà pronta senza aspettare l’altra', () => {
    reports({ rows: [valutazione()], simulationsPending: true })
    renderScores()

    expect(screen.getByText('Voto Medio Complessivo')).toBeInTheDocument()
    // Il conteggio dell'altra linguetta compare quando arriva
    expect(screen.getByRole('tab', { name: 'Conversazioni (1)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Simulazioni tecniche' })).toBeInTheDocument()
  })

  it('aspetta invece la metà che si sta guardando', () => {
    reports({ evaluationsPending: true, simulations: [{}] })
    renderScores()

    expect(screen.getByRole('status')).toHaveTextContent('Caricamento dashboard...')
  })

  /* Le linguette sono legate al loro contenuto: chi ascolta la pagina deve
   * sentire che quel pannello è comandato da quella linguetta. */
  it('lega la linguetta al pannello che comanda', () => {
    reports({ rows: [valutazione()] })
    renderScores()

    const linguetta = screen.getByRole('tab', { name: 'Conversazioni (1)' })
    const pannello = screen.getByRole('tabpanel')
    expect(linguetta.getAttribute('aria-controls')).toBe(pannello.id)
  })
})

describe('quando non c’è niente da mostrare', () => {
  it('lo dice, e non con dei grafici a zero', () => {
    renderScores()

    expect(screen.getByText('Nessun dato disponibile')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  /* Con un periodo scelto il vuoto ha una causa probabile, e va detta:
   * altrimenti si legge come "non è mai stato fatto niente". */
  it('con un periodo scelto suggerisce di allargarlo', () => {
    renderScores('/app/admin/dashboard/punteggi', {
      organizationId: '',
      days: 7,
      period: '7',
    })

    expect(screen.getByText(/scegline uno più ampio/)).toBeInTheDocument()
  })
})

describe('quando qualcosa non arriva', () => {
  /* Un caricamento caduto è l'unica cosa a cui si può rimediare restando
   * dov'è: senza il comando l'unica via era ricaricare la pagina. */
  it('offre di riprovare', async () => {
    reports({ error: new Error('Server non raggiungibile.') })
    renderScores()

    expect(screen.getByText('Server non raggiungibile.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Riprova' }))

    expect(refetchValutazioni).toHaveBeenCalled()
    expect(refetchTentativi).toHaveBeenCalled()
  })

  /* Un file non prodotto non è una pagina senza dati: il messaggio sta
   * accanto al bottone che l'ha chiesto, e i grafici restano dove sono. */
  it('un’esportazione fallita non spegne la vista', async () => {
    reports({ rows: [valutazione()] })
    fetchEvaluationsReportXlsx.mockRejectedValue(new Error('Esportazione non riuscita.'))
    renderScores()

    await userEvent.click(screen.getByRole('button', { name: /Esporta Excel/ }))

    expect(await screen.findByText('Esportazione non riuscita.')).toBeInTheDocument()
    expect(screen.getByText('Voto Medio Complessivo')).toBeInTheDocument()
  })

  /* Il foglio è quello che si sta guardando: organizzazione e periodo. */
  it('esporta il periodo che si sta guardando', async () => {
    reports({ rows: [valutazione()] })
    fetchEvaluationsReportXlsx.mockResolvedValue(new Blob())
    renderScores('/app/admin/dashboard/punteggi', {
      organizationId: 'org-1',
      days: 90,
      period: '90',
    })

    await userEvent.click(screen.getByRole('button', { name: /Esporta Excel/ }))

    expect(fetchEvaluationsReportXlsx).toHaveBeenCalledWith('org-1', 90)
  })
})

describe('la tabella delle valutazioni', () => {
  /* Le righe si aprivano solo col mouse: da tastiera il dettaglio di una
   * conversazione non si raggiungeva in nessun modo. */
  it('apre una conversazione con Invio', async () => {
    reports({ rows: [valutazione()] })
    renderScores()

    const riga = screen.getByText('Reclamo carta').closest('tr')!
    riga.focus()
    await userEvent.keyboard('{Enter}')

    expect(screen.getByText('dettaglio di c-1')).toBeInTheDocument()
  })

  it('la apre anche col mouse', async () => {
    reports({ rows: [valutazione()] })
    renderScores()

    await userEvent.click(screen.getByText('Reclamo carta'))

    expect(screen.getByText('dettaglio di c-1')).toBeInTheDocument()
  })

  /* Le etichette per esteso arrivano una volta per risposta e non su ogni
   * riga: qui non se ne tiene una copia, perché una lista ricopiata a mano
   * col tempo racconta criteri diversi da quelli su cui il giudizio è stato
   * dato. La colonna si intesta col nome corto e tiene quello intero nel
   * tooltip. */
  it('intesta la colonna di un criterio con l’etichetta della risposta', () => {
    reports({
      rows: [valutazione({ criteria: { rispetto_fasi_chiamata: 8 } })],
      criteriaLabels: { rispetto_fasi_chiamata: 'Rispetto delle fasi della chiamata' },
    })
    renderScores()

    expect(screen.getByRole('columnheader', { name: /Fasi/ })).toBeInTheDocument()
  })

  /* Un criterio che il server manda senza etichetta deve comunque intestare
   * la sua colonna, invece di lasciarla senza nome. */
  it('ripiega sulla chiave quando l’etichetta non c’è', () => {
    reports({ rows: [valutazione({ criteria: { cortesia: 6 } })], criteriaLabels: {} })
    renderScores()

    expect(screen.getByRole('columnheader', { name: /cortesia/ })).toBeInTheDocument()
  })
})

/* Il tetto del server esiste perché "sempre" su un tenant di tre anni è
 * tutto lo storico a ogni apertura. Quando scatta, quello che si guarda sono
 * le prove più recenti: dirlo è la differenza fra una pagina che si sa
 * incompleta e delle medie parziali lette come le medie di tutto. */
describe('quando le prove del periodo sono troppe', () => {
  it('avverte che i grafici mostrano le più recenti', () => {
    reports({ rows: [valutazione()], truncated: true })
    renderScores()

    expect(screen.getByText(/mostrano le più recenti/)).toBeInTheDocument()
  })

  it('non dice niente quando ci stanno tutte', () => {
    reports({ rows: [valutazione()] })
    renderScores()

    expect(screen.queryByText(/mostrano le più recenti/)).not.toBeInTheDocument()
  })
})

describe('il confronto fra utenti', () => {
  /* Con venticinque persone per organizzazione la colonna delle barre è
   * lunga: si scelgono quelle da mettere a confronto, e il grafico resta di
   * loro. Senza nessuna scelta resta di tutti, perché chi voleva solo
   * guardare come va il gruppo non deve comporre niente. */
  it('senza scelte disegna tutte le persone', () => {
    reports({
      rows: [
        valutazione({ user_id: 'u-1', user_nome: 'Anna', user_cognome: 'Ferrari' }),
        valutazione({
          conversation_id: 'c-2',
          user_id: 'u-2',
          user_nome: 'Marco',
          user_cognome: 'Bianchi',
        }),
      ],
    })
    renderScores('/app/admin/dashboard/punteggi', DENTRO_UNA_ORG)

    const confronto = screen.getByRole('region', { name: 'Confronto tra Utenti' })
    expect(within(confronto).getByText('Anna Ferrari')).toBeInTheDocument()
    expect(within(confronto).getByText('Marco Bianchi')).toBeInTheDocument()
  })

  it('scritta nell’indirizzo, la scelta compone il grafico', () => {
    reports({
      rows: [
        valutazione({ user_id: 'u-1', user_nome: 'Anna', user_cognome: 'Ferrari' }),
        valutazione({
          conversation_id: 'c-2',
          user_id: 'u-2',
          user_nome: 'Marco',
          user_cognome: 'Bianchi',
        }),
      ],
    })
    renderScores('/app/admin/dashboard/punteggi?confronto=u-1', DENTRO_UNA_ORG)

    const confronto = screen.getByRole('region', { name: 'Confronto tra Utenti' })
    expect(within(confronto).getByText('Anna Ferrari')).toBeInTheDocument()
    expect(within(confronto).queryByText('Marco Bianchi')).not.toBeInTheDocument()
  })

  it('scegliere una persona la scrive nell’indirizzo', async () => {
    reports({ rows: [valutazione({ user_id: 'u-1', user_nome: 'Anna', user_cognome: 'Ferrari' })] })
    renderScores('/app/admin/dashboard/punteggi', DENTRO_UNA_ORG)

    await userEvent.click(screen.getByPlaceholderText(/persone da confrontare/))
    await userEvent.click(screen.getByRole('option', { name: /Anna Ferrari/ }))

    expect(indirizzo()).toContain('confronto=u-1')
  })

  /* Le barre stanno dalla media più alta, che è la risposta della scheda; la
   * tendina che le sceglie sta in ordine alfabetico per cognome, come la
   * tabella di gestione utenti, perché lì un nome si cerca. */
  it('elenca le persone per cognome nella tendina, e per media nelle barre', async () => {
    reports({
      rows: [
        valutazione({
          user_id: 'u-1',
          user_nome: 'Anna',
          user_cognome: 'Zanetti',
          overall_score: 9,
        }),
        valutazione({
          conversation_id: 'c-2',
          user_id: 'u-2',
          user_nome: 'Zeno',
          user_cognome: 'Abate',
          overall_score: 4,
        }),
      ],
    })
    renderScores('/app/admin/dashboard/punteggi', DENTRO_UNA_ORG)

    const confronto = screen.getByRole('region', { name: 'Confronto tra Utenti' })
    // Le barre: prima chi ha la media più alta
    const barre = within(confronto)
      .getAllByText(/Anna Zanetti|Zeno Abate/)
      .map((n) => n.textContent)
    expect(barre).toEqual(['Anna Zanetti', 'Zeno Abate'])

    await userEvent.click(screen.getByPlaceholderText(/persone da confrontare/))
    const voci = screen.getAllByRole('option').map((o) => o.textContent)
    expect(voci[0]).toContain('Zeno Abate')
    expect(voci[1]).toContain('Anna Zanetti')
  })

  /* Due persone di organizzazioni diverse si allenano su avatar e test
   * diversi: le loro medie non stanno sulla stessa scala, quindi finché il
   * super admin guarda tutti i tenant insieme il comando non c'è. */
  it('non si compone finché il super admin guarda tutte le organizzazioni', () => {
    reports({ rows: [valutazione()] })
    renderScores()

    expect(screen.getByText(/Scegli una organizzazione qui sopra/)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/persone da confrontare/)).not.toBeInTheDocument()
  })

  it('con una organizzazione scelta il comando c’è', () => {
    reports({ rows: [valutazione()] })
    renderScores('/app/admin/dashboard/punteggi', DENTRO_UNA_ORG)

    expect(screen.getByPlaceholderText(/persone da confrontare/)).toBeInTheDocument()
    expect(screen.queryByText(/Scegli una organizzazione qui sopra/)).not.toBeInTheDocument()
  })

  /* A un org admin il server risponde solo con la sua gente, quindi il
   * confronto è già dentro un tenant solo e il comando c'è da subito. */
  it('per chi amministra una sola organizzazione il comando c’è sempre', () => {
    useAuth.mockReturnValue({
      user: { id: 'admin-2', ruolo: 'organization_admin', organization_id: 'org-1' },
    })
    reports({ rows: [valutazione()] })
    renderScores()

    expect(screen.getByPlaceholderText(/persone da confrontare/)).toBeInTheDocument()
  })
})
