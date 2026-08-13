import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessione = vi.hoisted(() => ({ current: { ruolo: 'user' } }))
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: sessione.current }) }))

const stato = vi.hoisted(() => ({
  people: [] as unknown[],
  attempts: { data: [] as unknown[], isPending: false, error: null as unknown },
  simulations: { data: [] as unknown[], isPending: false, error: null as unknown },
  chiesto: { subjectId: '' },
  soggetto: null as Record<string, unknown> | null,
}))
vi.mock('../../src/hooks/useComparison', () => ({
  useComparableUsers: (enabled: boolean) => ({ data: enabled ? stato.people : [] }),
  useAttempts: (subjectId: string) => {
    stato.chiesto.subjectId = subjectId
    return stato.attempts
  },
  useSimulationAttempts: () => stato.simulations,
}))

/* Le due viste hanno i loro test: qui interessa quale delle due la pagina
 * mette davanti, non come disegnano i tentativi. */
vi.mock('../../src/components/ComparisonConversations', () => ({
  default: ({ attempts, subject }: { attempts: unknown[]; subject: Record<string, unknown> }) => {
    stato.soggetto = subject
    return <div>conversazioni: {attempts.length}</div>
  },
}))
vi.mock('../../src/components/ComparisonSimulations', () => ({
  default: ({ attempts }: { attempts: unknown[] }) => <div>simulazioni: {attempts.length}</div>,
}))

import ComparisonPage from '../../src/components/ComparisonPage'

function renderPage(ruolo = 'user') {
  sessione.current = { ruolo }
  render(<ComparisonPage />)
}

beforeEach(() => {
  stato.people = [{ id: 'u-2', nome: 'Marco', cognome: 'Bianchi', email: 'marco@test.it' }]
  stato.attempts = { data: [{ conversation_id: 'c-1' }], isPending: false, error: null }
  stato.simulations = { data: [], isPending: false, error: null }
  stato.chiesto.subjectId = ''
})

/* Il confronto è sempre di una persona con se stessa: lo studente vede le
 * proprie prove, un admin ne apre una alla volta. Non esiste un modo di
 * mettere due persone a confronto, ed è voluto. */
describe('scelta della persona', () => {
  it('uno studente non sceglie nessuno', () => {
    renderPage()

    expect(screen.queryByLabelText('Persona')).not.toBeInTheDocument()
    expect(screen.getByText(/Affianca due delle tue prove/)).toBeInTheDocument()
  })

  it('un admin sceglie fra le persone del proprio tenant', async () => {
    renderPage('organization_admin')

    expect(screen.getByText(/Seleziona una persona/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('option', { name: 'Marco Bianchi' })).toBeInTheDocument()
  })

  it('parte dalle proprie prove anche per un admin', () => {
    renderPage('organization_admin')

    expect(screen.getByRole('combobox')).toHaveTextContent('Le mie prove')
    expect(stato.chiesto.subjectId).toBe('')
  })

  it('legge i tentativi della persona scelta', async () => {
    renderPage('organization_admin')

    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'Marco Bianchi' }))

    expect(stato.chiesto.subjectId).toBe('u-2')
  })

  /* Di chi sono le prove serve alla metà parlata per aprire la trascrizione:
     le proprie e quelle di un'altra persona si leggono da due endpoint
     diversi, e l'intestazione dice chi ha parlato. */
  it('dice alla metà parlata di chi sono le prove', async () => {
    renderPage('organization_admin')
    expect(stato.soggetto).toMatchObject({ isSelf: true })

    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'Marco Bianchi' }))

    expect(stato.soggetto).toMatchObject({
      isSelf: false,
      nome: 'Marco',
      cognome: 'Bianchi',
      email: 'marco@test.it',
    })
  })
})

/* Una linguetta per prova: una conversazione valutata e un test tecnico si
 * guardano una per volta, perché il miglioramento in una non dice niente
 * dell'altra. */
describe('le due prove', () => {
  it('conta i tentativi di ciascuna', () => {
    stato.simulations = {
      data: [{ attempt_id: 't-1' }, { attempt_id: 't-2' }],
      isPending: false,
      error: null,
    }
    renderPage()

    expect(screen.getByRole('tab', { name: 'Conversazioni (1)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Simulazioni tecniche (2)' })).toBeInTheDocument()
  })

  it('si apre sulle conversazioni', () => {
    renderPage()

    expect(screen.getByText('conversazioni: 1')).toBeInTheDocument()
  })

  it('passa ai test tecnici', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('tab', { name: /Simulazioni tecniche/ }))

    expect(screen.getByText('simulazioni: 0')).toBeInTheDocument()
    expect(screen.queryByText(/^conversazioni:/)).not.toBeInTheDocument()
  })
})

describe('caricamento ed errori', () => {
  it('aspetta che siano arrivate entrambe le prove', () => {
    stato.simulations = { data: [], isPending: true, error: null }
    renderPage()

    expect(screen.getByText('Caricamento tentativi...')).toBeInTheDocument()
  })

  it('riporta il motivo di un caricamento fallito', () => {
    stato.attempts = { data: [], isPending: false, error: new Error('Sessione scaduta.') }
    renderPage()

    expect(screen.getByText('Sessione scaduta.')).toBeInTheDocument()
  })

  it("riporta anche l'errore dei soli test tecnici", () => {
    stato.simulations = { data: [], isPending: false, error: new Error('Test non disponibili.') }
    renderPage()

    expect(screen.getByText('Test non disponibili.')).toBeInTheDocument()
  })

  it("ripiega su un messaggio suo quando l'errore non ne porta uno", () => {
    stato.attempts = { data: [], isPending: false, error: 'guasto' }
    renderPage()

    expect(screen.getByText('Impossibile caricare i tentativi.')).toBeInTheDocument()
  })
})
