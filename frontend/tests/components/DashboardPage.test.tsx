import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* La dashboard di chi amministra: quello che decide da sé, cioè i filtri, da
 * dove si leggono e cosa succede quando una delle due metà non c'è.
 *
 * Le due metà hanno i loro test (la sezione scritta in DashboardSimulations,
 * i grafici in scoreCharts): qui si sostituiscono, così il banco resta a
 * quello che la pagina decide. */

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useAuth', () => ({ useAuth }))
vi.mock('../../src/hooks/useOrganizations', () => ({
  useOrganizations: () => ({ data: [{ id: 'org-1', name: 'Prima org' }] }),
}))

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

import DashboardPage from '../../src/components/DashboardPage'
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

function renderDashboard(percorso = '/app/admin/dashboard') {
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <Indirizzo />
      <Routes>
        <Route path="/app/admin/dashboard" element={<DashboardPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuth.mockReturnValue({ user: { id: 'admin-1', ruolo: 'super_admin' } })
  reports()
})

describe('i filtri della dashboard', () => {
  /* Una dashboard è la schermata che si guarda in due davanti allo stesso
   * schermo: senza le scelte nell'indirizzo, un ricaricamento riporta al
   * punto di partenza e un collegamento mandato a qualcuno gli apre
   * un'altra pagina. */
  it('scrive nell’indirizzo il canale scelto', async () => {
    reports({ rows: [valutazione()] })
    renderDashboard()

    await userEvent.click(screen.getByRole('radio', { name: 'Chat' }))

    expect(indirizzo()).toContain('canale=text')
  })

  /* Il default non si scrive: un indirizzo pieno di parametri che valgono
   * quello che valevano già è un indirizzo che nessuno copia. */
  it('non scrive il valore di partenza', async () => {
    reports({ rows: [valutazione()] })
    renderDashboard('/app/admin/dashboard?canale=text')

    await userEvent.click(screen.getByRole('radio', { name: 'Chiamate' }))

    expect(indirizzo()).not.toContain('canale')
  })

  it('riapre la pagina come la si era lasciata', () => {
    reports({ rows: [valutazione()] })
    renderDashboard('/app/admin/dashboard?canale=text&prova=simulazioni')

    expect(screen.getByRole('tab', { name: /Simulazioni tecniche/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('metà scritta')).toBeInTheDocument()
  })

  /* Un valore inventato nell'indirizzo non deve lasciare la pagina senza
   * nessuna scelta accesa. */
  it('ignora un canale che non esiste', () => {
    reports({ rows: [valutazione()] })
    renderDashboard('/app/admin/dashboard?canale=piccioni')

    expect(screen.getByRole('radio', { name: 'Chiamate' })).toHaveAttribute('aria-checked', 'true')
  })

  /* Il periodo è l'unico filtro che il server capisce insieme
   * all'organizzazione: gli altri restringono righe già arrivate, questo
   * decide quante ne arrivano. */
  it('porta il periodo scelto alle due letture', () => {
    reports({ rows: [valutazione()] })
    renderDashboard('/app/admin/dashboard?periodo=30')

    expect(useEvaluationsReport).toHaveBeenCalledWith('', 30, true)
    expect(useSimulationsReport).toHaveBeenCalledWith('', 30, true)
  })

  it('senza periodo scelto chiede tutto lo storico', () => {
    renderDashboard()

    expect(useEvaluationsReport).toHaveBeenCalledWith('', undefined, true)
  })

  /* Cambiando organizzazione la persona scelta non è più fra quelle in
   * elenco: resterebbe un filtro attivo su qualcuno che non c'è. */
  it('lascia andare la persona quando cambia l’organizzazione', async () => {
    reports({ rows: [valutazione()] })
    renderDashboard('/app/admin/dashboard?persona=u-1')

    await userEvent.click(screen.getByRole('combobox', { name: 'Organizzazione' }))
    await userEvent.click(screen.getByRole('option', { name: 'Prima org' }))

    expect(indirizzo()).toContain('organizzazione=org-1')
    expect(indirizzo()).not.toContain('persona')
  })

  /* Azzerare riporta la dashboard a tutta la storia e a tutte le
     organizzazioni, e la persona se ne va con loro: era scelta dentro
     l'elenco che l'organizzazione portava. */
  it('azzera periodo, organizzazione e persona', async () => {
    reports({ rows: [valutazione()] })
    renderDashboard('/app/admin/dashboard?periodo=30&organizzazione=org-1&persona=u-1')

    await userEvent.click(screen.getByRole('button', { name: 'Azzera Filtri' }))

    expect(indirizzo()).not.toContain('periodo')
    expect(indirizzo()).not.toContain('organizzazione')
    expect(indirizzo()).not.toContain('persona')
  })
})

describe('le due metà della dashboard', () => {
  /* La linguetta che si sta guardando disegna appena i suoi dati sono
   * pronti: prima aspettava anche la scansione dell'altra prova, che è una
   * query a parte e più lenta. */
  it('disegna la metà pronta senza aspettare l’altra', () => {
    reports({ rows: [valutazione()], simulationsPending: true })
    renderDashboard()

    expect(screen.getByText('Voto Medio Complessivo')).toBeInTheDocument()
    // Il conteggio dell'altra linguetta compare quando arriva
    expect(screen.getByRole('tab', { name: 'Conversazioni (1)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Simulazioni tecniche' })).toBeInTheDocument()
  })

  it('aspetta invece la metà che si sta guardando', () => {
    reports({ evaluationsPending: true, simulations: [{}] })
    renderDashboard()

    expect(screen.getByRole('status')).toHaveTextContent('Caricamento dashboard...')
  })

  /* Le linguette sono legate al loro contenuto: chi ascolta la pagina deve
   * sentire che quel pannello è comandato da quella linguetta. */
  it('lega la linguetta al pannello che comanda', () => {
    reports({ rows: [valutazione()] })
    renderDashboard()

    const linguetta = screen.getByRole('tab', { name: 'Conversazioni (1)' })
    const pannello = screen.getByRole('tabpanel')
    expect(linguetta.getAttribute('aria-controls')).toBe(pannello.id)
  })
})

describe('quando non c’è niente da mostrare', () => {
  it('lo dice, e non con dei grafici a zero', () => {
    renderDashboard()

    expect(screen.getByText('Nessun dato disponibile')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  /* Con un periodo scelto il vuoto ha una causa probabile, e va detta:
   * altrimenti si legge come "non è mai stato fatto niente". */
  it('con un periodo scelto suggerisce di allargarlo', () => {
    renderDashboard('/app/admin/dashboard?periodo=7')

    expect(screen.getByText(/scegline uno più ampio/)).toBeInTheDocument()
  })
})

describe('quando qualcosa non arriva', () => {
  /* Un caricamento caduto è l'unica cosa a cui si può rimediare restando
   * dov'è: senza il comando l'unica via era ricaricare la pagina. */
  it('offre di riprovare', async () => {
    reports({ error: new Error('Server non raggiungibile.') })
    renderDashboard()

    expect(screen.getByText('Server non raggiungibile.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Riprova' }))

    expect(refetchValutazioni).toHaveBeenCalled()
    expect(refetchTentativi).toHaveBeenCalled()
  })

  /* Un file non prodotto non è una pagina senza dati: il messaggio sta
   * accanto al bottone che l'ha chiesto, e i grafici restano dove sono. */
  it('un’esportazione fallita non spegne la dashboard', async () => {
    reports({ rows: [valutazione()] })
    fetchEvaluationsReportXlsx.mockRejectedValue(new Error('Esportazione non riuscita.'))
    renderDashboard()

    await userEvent.click(screen.getByRole('button', { name: /Esporta Excel/ }))

    expect(await screen.findByText('Esportazione non riuscita.')).toBeInTheDocument()
    expect(screen.getByText('Voto Medio Complessivo')).toBeInTheDocument()
  })

  /* Il foglio è quello che si sta guardando: organizzazione e periodo. */
  it('esporta il periodo che si sta guardando', async () => {
    reports({ rows: [valutazione()] })
    fetchEvaluationsReportXlsx.mockResolvedValue(new Blob())
    renderDashboard('/app/admin/dashboard?periodo=90&organizzazione=org-1')

    await userEvent.click(screen.getByRole('button', { name: /Esporta Excel/ }))

    expect(fetchEvaluationsReportXlsx).toHaveBeenCalledWith('org-1', 90)
  })
})

describe('la tabella delle valutazioni', () => {
  /* Le righe si aprivano solo col mouse: da tastiera il dettaglio di una
   * conversazione non si raggiungeva in nessun modo. */
  it('apre una conversazione con Invio', async () => {
    reports({ rows: [valutazione()] })
    renderDashboard()

    const riga = screen.getByText('Reclamo carta').closest('tr')!
    riga.focus()
    await userEvent.keyboard('{Enter}')

    expect(screen.getByText('dettaglio di c-1')).toBeInTheDocument()
  })

  it('la apre anche col mouse', async () => {
    reports({ rows: [valutazione()] })
    renderDashboard()

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
    renderDashboard()

    expect(screen.getByRole('columnheader', { name: /Fasi/ })).toBeInTheDocument()
  })

  /* Un criterio che il server manda senza etichetta deve comunque intestare
   * la sua colonna, invece di lasciarla senza nome. */
  it('ripiega sulla chiave quando l’etichetta non c’è', () => {
    reports({ rows: [valutazione({ criteria: { cortesia: 6 } })], criteriaLabels: {} })
    renderDashboard()

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
    renderDashboard()

    expect(screen.getByText(/mostrano le più recenti/)).toBeInTheDocument()
  })

  it('non dice niente quando ci stanno tutte', () => {
    reports({ rows: [valutazione()] })
    renderDashboard()

    expect(screen.queryByText(/mostrano le più recenti/)).not.toBeInTheDocument()
  })
})
