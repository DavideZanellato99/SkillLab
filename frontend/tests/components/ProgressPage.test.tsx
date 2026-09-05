import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* I propri progressi, la pagina di chi si allena.
 *
 * Due cose si provano qui più delle altre: che il voto mostrato sia quello
 * finale, cioè quello che la persona si è vista dare, e che dentro non
 * finisca niente che riguardi i colleghi. Una classifica in aula è un'altra
 * domanda, con altre conseguenze. */

const useMyProgress = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useDashboards', () => ({ useMyProgress }))

import ProgressPage from '../../src/components/ProgressPage'
import type { MyProgress } from '../../src/services/dashboards'

const refetch = vi.fn()

function progressi(over: Partial<MyProgress> = {}): MyProgress {
  return {
    criteria_labels: { empatia: 'Empatia' },
    conversations: [
      {
        conversation_id: 'c-1',
        title: 'Reclamo carta',
        mode: 'voice',
        avatar_name: 'Cliente arrabbiato',
        conversation_at: '2026-03-01T10:00:00Z',
        score: 8,
        has_override: true,
        criteria: { empatia: 6 },
      },
    ],
    simulations: [
      {
        attempt_id: 't-1',
        simulation_id: 's-1',
        simulation_title: 'Procedure di cassa',
        simulation_kind: 'multiple',
        attempted_at: '2026-03-02T10:00:00Z',
        score: 7,
        correct_count: 7,
        question_count: 10,
      },
    ],
    ...over,
  }
}

function readings({
  data = progressi(),
  isPending = false,
  error = null as unknown,
}: { data?: MyProgress | undefined; isPending?: boolean; error?: unknown } = {}) {
  useMyProgress.mockReturnValue({
    data,
    isPending,
    isPlaceholderData: false,
    error,
    refetch,
  })
}

function Indirizzo() {
  const { search } = useLocation()
  return <p data-testid="indirizzo">{search}</p>
}

const indirizzo = () => screen.getByTestId('indirizzo').textContent ?? ''

function renderProgress(percorso = '/app/progressi') {
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <Indirizzo />
      <ProgressPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  readings()
})

describe('le proprie prove', () => {
  /* Il voto è quello finale: una curva disegnata sul numero della macchina
   * contraddirebbe la pagella che la persona ha in mano. */
  it('mostra il voto corretto dal docente e lo dice', () => {
    renderProgress()

    expect(screen.getByText('8/10')).toBeInTheDocument()
    expect(screen.getByText('corretto')).toBeInTheDocument()
  })

  /* Le due prove restano separate, come nella dashboard di chi amministra:
   * "come parlo" e "cosa so" sono due domande. */
  it('passa ai test tecnici e lo scrive nell’indirizzo', async () => {
    renderProgress()

    await userEvent.click(screen.getByRole('tab', { name: /Test tecnici/ }))

    expect(indirizzo()).toContain('prova=simulazioni')
    expect(screen.getByText('Procedure di cassa')).toBeInTheDocument()
  })

  it('porta il periodo scelto alla lettura', () => {
    renderProgress('/app/progressi?periodo=30')

    expect(useMyProgress).toHaveBeenCalledWith(30)
  })

  /* Qui non c'è niente sugli altri: nessuna media di gruppo, nessuna
   * posizione, nessun nome di collega. */
  it('non confronta con nessun altro', () => {
    renderProgress()

    expect(screen.queryByText(/Confronto tra Utenti/)).not.toBeInTheDocument()
  })
})

describe('l’andamento', () => {
  /* Due prove sole sono due giornate, e una giornata storta racconterebbe un
   * peggioramento che non c'è stato: sotto le quattro prove non si dice
   * niente. */
  it('non si pronuncia con poche prove', () => {
    renderProgress()

    expect(screen.getByText(/almeno quattro prove/)).toBeInTheDocument()
  })

  it('scrive lo scarto quando le prove bastano', () => {
    const base = progressi().conversations[0]
    readings({
      data: progressi({
        conversations: [4, 5, 7, 8].map((score, index) => ({
          ...base,
          conversation_id: `c-${index}`,
          score,
          has_override: false,
        })),
      }),
    })
    renderProgress()

    // Dalle prime due prove (4 e 5) alle ultime due (7 e 8): tre punti pieni
    expect(screen.getByText('▲ +3')).toBeInTheDocument()
  })
})

describe('quando non c’è ancora niente', () => {
  it('lo dice invece di disegnare una curva vuota', () => {
    readings({ data: progressi({ conversations: [], simulations: [] }) })
    renderProgress()

    expect(screen.getByText('Nessuna prova ancora')).toBeInTheDocument()
  })

  it('offre di riprovare quando la lettura cade', () => {
    readings({ data: undefined, error: new Error('Server non raggiungibile.') })
    renderProgress()

    expect(screen.getByRole('button', { name: 'Riprova' })).toBeInTheDocument()
  })
})
