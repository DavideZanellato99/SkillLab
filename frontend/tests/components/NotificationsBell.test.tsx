import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const useNotifications = vi.hoisted(() => vi.fn())
const mutate = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useNotifications', () => ({
  useNotifications,
  useMarkNotificationsRead: () => ({ mutate }),
}))

import type { AppNotification } from '../../src/services/notifications'
import NotificationsBell from '../../src/components/NotificationsBell'

const avviso = (over: Partial<AppNotification> = {}): AppNotification => ({
  key: 'n-1',
  kind: 'assignment.assigned',
  title: 'Nuovo percorso assegnato',
  body: 'Onboarding, 3 tappe',
  at: '2026-03-01T10:00:00',
  read: false,
  link: '/app/percorsi/as-1',
  ...over,
})

function renderBell(items: AppNotification[] = [], unread = items.filter((i) => !i.read).length) {
  useNotifications.mockReturnValue({ data: { items, unread } })
  render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/app" element={<NotificationsBell />} />
        <Route path="/app/percorsi/:id" element={<p>Sentiero aperto</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const campanella = () => screen.getByRole('button', { name: /Notifiche/ })

beforeEach(() => {
  useNotifications.mockReset()
  mutate.mockReset()
  // Le date sono relative a adesso: senza un adesso fermo il test cambierebbe
  // risposta con il passare dei minuti
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-03-01T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('NotificationsBell', () => {
  it('conta le notifiche non lette', () => {
    renderBell([avviso(), avviso({ key: 'n-2' })])

    expect(screen.getByRole('button', { name: 'Notifiche, 2 non lette' })).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  /* Oltre la decina il numero si accorcia: la pastiglia è larga quanto una
   * cifra, e un "12" la sfonderebbe accanto al bordo della campanella. */
  it('accorcia il conteggio oltre la decina', () => {
    renderBell([avviso()], 12)

    expect(screen.getByText('9+')).toBeInTheDocument()
  })

  it('non mostra nessuna pastiglia quando è tutto letto', () => {
    renderBell([avviso({ read: true })])

    expect(screen.getByRole('button', { name: 'Notifiche' })).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('apre e richiude il pannello', async () => {
    renderBell([avviso()])

    await userEvent.click(campanella())
    expect(screen.getByText('Nuovo percorso assegnato')).toBeInTheDocument()

    await userEvent.click(campanella())
    expect(screen.queryByText('Nuovo percorso assegnato')).not.toBeInTheDocument()
  })

  it("dice quando non c'è niente da leggere", async () => {
    renderBell([])

    await userEvent.click(campanella())

    expect(screen.getByText('Nessuna notifica')).toBeInTheDocument()
  })

  it('mostra da quanto tempo è arrivata', async () => {
    renderBell([
      avviso({ at: '2026-03-01T11:30:00' }),
      avviso({ key: 'n-2', at: '2026-02-27T12:00:00' }),
    ])

    await userEvent.click(campanella())

    expect(screen.getByText('30 min fa')).toBeInTheDocument()
    expect(screen.getByText('2 giorni fa')).toBeInTheDocument()
  })

  /* Le date arrivano in UTC senza suffisso: lette come ora locale
   * diventerebbero avvisi arrivati nel futuro, cioè tutti "adesso". */
  it('legge le date come UTC anche senza suffisso', async () => {
    renderBell([avviso({ at: '2026-03-01T11:59:50' })])

    await userEvent.click(campanella())

    expect(screen.getByText('adesso')).toBeInTheDocument()
  })

  it('segna letta la notifica aperta e ci porta', async () => {
    renderBell([avviso()])

    await userEvent.click(campanella())
    await userEvent.click(screen.getByText('Nuovo percorso assegnato'))

    expect(mutate).toHaveBeenCalledWith(['n-1'])
    expect(screen.getByText('Sentiero aperto')).toBeInTheDocument()
  })

  it('non rimarca una notifica già letta', async () => {
    renderBell([avviso({ read: true })])

    await userEvent.click(campanella())
    await userEvent.click(screen.getByText('Nuovo percorso assegnato'))

    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText('Sentiero aperto')).toBeInTheDocument()
  })

  it("resta dov'è per una notifica che non porta da nessuna parte", async () => {
    renderBell([avviso({ link: null })])

    await userEvent.click(campanella())
    await userEvent.click(screen.getByText('Nuovo percorso assegnato'))

    expect(mutate).toHaveBeenCalledWith(['n-1'])
    expect(screen.queryByText('Sentiero aperto')).not.toBeInTheDocument()
  })

  /* Segnarle tutte lascia decidere al server quali siano: sono derivate a
   * ogni lettura, e mandare le chiavi viste qui lascerebbe accesa una
   * notifica comparsa nel frattempo. */
  it('segna tutte le notifiche senza elencarle', async () => {
    renderBell([avviso(), avviso({ key: 'n-2' })])

    await userEvent.click(campanella())
    await userEvent.click(screen.getByRole('button', { name: 'Segna tutte come lette' }))

    expect(mutate).toHaveBeenCalledWith(undefined)
  })

  it('non offre di segnare tutte quando è già tutto letto', async () => {
    renderBell([avviso({ read: true })])

    await userEvent.click(campanella())

    expect(screen.queryByRole('button', { name: 'Segna tutte come lette' })).not.toBeInTheDocument()
  })

  /* La campanella è un accessorio: un errore di rete qui non deve piazzare
   * un avviso rosso in cima all'app, resta semplicemente vuota. */
  it('resta muta quando la lettura fallisce', () => {
    useNotifications.mockReturnValue({ data: undefined })
    render(
      <MemoryRouter>
        <NotificationsBell />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Notifiche' })).toBeInTheDocument()
  })

  it("disegna un'icona diversa per ogni tipo di avviso", async () => {
    renderBell([
      avviso({ key: 'n-1', kind: 'assignment.unlocked' }),
      avviso({ key: 'n-2', kind: 'assignment.completed' }),
      avviso({ key: 'n-3', kind: 'assignment.due_soon' }),
      avviso({ key: 'n-4', kind: 'assignment.overdue' }),
      avviso({ key: 'n-5', kind: 'review.published' }),
    ])

    await userEvent.click(campanella())

    const icone = [...document.querySelectorAll('svg')].map((s) => s.innerHTML)
    expect(new Set(icone).size).toBeGreaterThan(4)
  })
})
