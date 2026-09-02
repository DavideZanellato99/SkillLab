import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateUser = vi.hoisted(() => vi.fn())
const utenteCorrente = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }))
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: utenteCorrente.current, updateUser }),
}))

const markSeen = vi.hoisted(() => ({ mutate: vi.fn() }))
vi.mock('../../src/hooks/useTutorial', () => ({ useMarkTutorialSeen: () => markSeen }))

import TutorialTour from '../../src/components/TutorialTour'
import { openTutorial, TUTORIAL_USER_MENU_EVENT } from '../../src/components/tutorialEvents'

/* La guida introduttiva vista dal lato di chi la riceve: a chi compare da
 * sola, come si sfoglia, e cosa lascia scritto quando si chiude.
 *
 * Nessuna ancora esiste in questi test, perché la barra non è montata: in
 * jsdom ogni elemento misura zero e la guida disegna il riquadro al centro,
 * che è esattamente il comportamento previsto quando la voce di cui parla non
 * è a schermo. Quello che si prova qui è la sequenza, non il ritaglio. */

const utente = {
  id: 'u-1',
  cognito_sub: 'sub-1',
  email: 'anna@test.it',
  nome: 'Anna',
  cognome: 'Rossi',
  ruolo: 'user',
  tutorial_seen_at: null as string | null,
}

function renderGuida(over: Record<string, unknown> = {}) {
  utenteCorrente.current = { ...utente, ...over }
  render(<TutorialTour />)
}

const avanti = () => screen.getByRole('button', { name: /Avanti|Ho capito/ })
const indietro = () => screen.getByRole('button', { name: 'Indietro' })

beforeEach(() => {
  markSeen.mutate.mockReset()
  updateUser.mockReset()
})

describe('a chi compare', () => {
  it('parte da sola al primo accesso di chi si allena', () => {
    renderGuida()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Benvenuto in SkillLab')).toBeInTheDocument()
    expect(screen.getByText('Passo 1 di 8')).toBeInTheDocument()
  })

  it('non torna a chi l’ha già vista', () => {
    renderGuida({ tutorial_seen_at: '2026-02-01T09:00:00Z' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('non compare mai al super admin, nemmeno al primo accesso', () => {
    renderGuida({ ruolo: 'super_admin', organization_id: null })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('racconta cose diverse a chi amministra', async () => {
    renderGuida({ ruolo: 'organization_admin' })
    await userEvent.click(avanti())

    /* Il secondo passo di chi amministra è il cruscotto della propria
       organizzazione, non la galleria: le due guide divergono subito. */
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })
})

describe('sfogliare i passi', () => {
  it('va avanti e torna indietro', async () => {
    renderGuida()

    await userEvent.click(avanti())
    expect(screen.getByText('Galleria Avatar')).toBeInTheDocument()
    expect(screen.getByText('Passo 2 di 8')).toBeInTheDocument()

    await userEvent.click(indietro())
    expect(screen.getByText('Benvenuto in SkillLab')).toBeInTheDocument()
  })

  it('sul primo passo non offre un indietro che non porta da nessuna parte', () => {
    renderGuida()

    expect(screen.queryByRole('button', { name: 'Indietro' })).not.toBeInTheDocument()
  })

  it('si sfoglia anche con le frecce', async () => {
    renderGuida()

    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByText('Galleria Avatar')).toBeInTheDocument()

    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByText('Benvenuto in SkillLab')).toBeInTheDocument()
  })

  it('chiede alla barra di aprire il menu del proprio account sui passi che ne parlano', async () => {
    const aperture: boolean[] = []
    const spia = (event: Event) =>
      aperture.push((event as CustomEvent<{ open: boolean }>).detail.open)
    window.addEventListener(TUTORIAL_USER_MENU_EVENT, spia)

    renderGuida({ ruolo: 'organization_admin' })
    // Benvenuto, dashboard, galleria: nessuno dei tre sta nel menu
    await userEvent.click(avanti())
    await userEvent.click(avanti())
    expect(aperture.at(-1)).toBe(false)

    // Gestione Simulazioni, che nel menu ci sta
    await userEvent.click(avanti())
    expect(screen.getByText('Gestione Simulazioni')).toBeInTheDocument()
    expect(aperture.at(-1)).toBe(true)

    window.removeEventListener(TUTORIAL_USER_MENU_EVENT, spia)
  })
})

describe('chiudere', () => {
  const ultimoPasso = async () => {
    for (let i = 0; i < 7; i++) await userEvent.click(avanti())
  }

  it('arrivata in fondo si chiude e resta segnata come vista', async () => {
    renderGuida()
    await ultimoPasso()

    expect(screen.getByText('Puoi rileggerla quando vuoi')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ho capito' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(markSeen.mutate).toHaveBeenCalledTimes(1)
  })

  it('la segna come vista anche a chi la chiude al primo passo', async () => {
    renderGuida()

    await userEvent.click(screen.getByRole('button', { name: 'Chiudi la guida' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(markSeen.mutate).toHaveBeenCalledTimes(1)
  })

  it('si chiude con Esc', async () => {
    renderGuida()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('allinea il profilo in sessione, che è ciò che le impedisce di ripartire', async () => {
    renderGuida()
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi la guida' }))

    const [payload, options] = markSeen.mutate.mock.calls[0]
    expect(payload).toBeUndefined()
    const aggiornato = { ...utente, tutorial_seen_at: '2026-02-01T09:00:00Z' }
    ;(options as { onSuccess: (u: unknown) => void }).onSuccess(aggiornato)
    expect(updateUser).toHaveBeenCalledWith(aggiornato)
  })
})

describe('rivederla dal proprio profilo', () => {
  it('riparte dal principio', async () => {
    renderGuida({ tutorial_seen_at: '2026-02-01T09:00:00Z' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    openTutorial()

    expect(await screen.findByText('Benvenuto in SkillLab')).toBeInTheDocument()
  })

  it('chiuderla la seconda volta non riscrive niente sul server', async () => {
    renderGuida({ tutorial_seen_at: '2026-02-01T09:00:00Z' })
    openTutorial()
    await screen.findByRole('dialog')

    await userEvent.click(screen.getByRole('button', { name: 'Chiudi la guida' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(markSeen.mutate).not.toHaveBeenCalled()
  })

  it('resta muta per il super admin, che di passi non ne ha', async () => {
    renderGuida({ ruolo: 'super_admin', tutorial_seen_at: null })

    openTutorial()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
