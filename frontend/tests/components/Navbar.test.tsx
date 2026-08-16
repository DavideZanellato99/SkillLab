import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const logout = vi.hoisted(() => vi.fn())
const sessione = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }))
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: sessione.current,
    isAuthenticated: sessione.current !== null,
    logout,
  }),
}))

/* La campanella e la modale hanno i loro test: qui sostituirle tiene il
 * banco a quello che la barra decide, cioè chi vede cosa. */
vi.mock('../../src/components/NotificationsBell', () => ({ default: () => <div>campanella</div> }))
vi.mock('../../src/components/AuthModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div>
      modale di accesso<button onClick={onClose}>chiudi</button>
    </div>
  ),
}))

import Navbar from '../../src/components/Navbar'
import { OPEN_LOGIN_EVENT } from '../../src/components/public/openLogin'

const utente = (ruolo: string) => ({
  id: 'u-1',
  cognito_sub: 'sub-1',
  email: 'anna@test.it',
  nome: 'Anna',
  cognome: 'Rossi',
  ruolo,
})

function renderNavbar(ruolo: string | null, percorso = '/app') {
  sessione.current = ruolo === null ? null : utente(ruolo)
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <Navbar />
    </MemoryRouter>,
  )
}

const menuUtente = () => screen.getByRole('button', { name: /Anna Rossi/ })

async function apriMenu() {
  await userEvent.click(menuUtente())
}

beforeEach(() => {
  logout.mockReset()
})

describe('prima di entrare', () => {
  it("offre di accedere e non mostra niente dell'app", () => {
    renderNavbar(null)

    expect(screen.getByRole('button', { name: 'Accedi' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Galleria Avatar/ })).not.toBeInTheDocument()
    expect(screen.queryByText('campanella')).not.toBeInTheDocument()
  })

  it('il logo porta alla home pubblica', () => {
    renderNavbar(null)

    expect(screen.getByRole('link', { name: /SkillLab/ })).toHaveAttribute('href', '/')
  })

  it('apre e chiude la modale di accesso', async () => {
    renderNavbar(null)

    await userEvent.click(screen.getByRole('button', { name: 'Accedi' }))
    expect(screen.getByText('modale di accesso')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'chiudi' }))
    expect(screen.queryByText('modale di accesso')).not.toBeInTheDocument()
  })

  /* Le pagine pubbliche non conoscono la modale: chiedono di aprirla con un
   * evento, e la modale vive qui. */
  it('apre la modale anche su richiesta delle pagine pubbliche', () => {
    renderNavbar(null)

    act(() => {
      window.dispatchEvent(new Event(OPEN_LOGIN_EVENT))
    })

    expect(screen.getByText('modale di accesso')).toBeInTheDocument()
  })
})

describe('dopo essere entrati', () => {
  it('mostra le voci che valgono per tutti', () => {
    renderNavbar('user')

    expect(screen.getByRole('link', { name: /Galleria Avatar/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Simulatore Tecnico/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Percorsi/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Confronto/ })).toBeInTheDocument()
    expect(screen.getByText('campanella')).toBeInTheDocument()
  })

  it('il logo porta alla galleria', () => {
    renderNavbar('user')

    expect(screen.getByRole('link', { name: /SkillLab/ })).toHaveAttribute('href', '/app')
  })

  it('non mostra la dashboard a chi non amministra', () => {
    renderNavbar('user')

    expect(screen.queryByRole('link', { name: /Dashboard/ })).not.toBeInTheDocument()
  })

  it('mostra la dashboard a un admin', () => {
    renderNavbar('organization_admin')

    expect(screen.getByRole('link', { name: /Dashboard/ })).toBeInTheDocument()
  })

  /* I percorsi affidati sono di chi si allena: chi amministra li compone
   * dalla gestione percorsi e non ne riceve, quindi la voce non c'è. */
  it('non mostra i percorsi a un org admin', () => {
    renderNavbar('organization_admin')

    expect(screen.queryByRole('link', { name: /Percorsi/ })).not.toBeInTheDocument()
  })

  it('non mostra i percorsi a un super admin', () => {
    renderNavbar('super_admin')

    expect(screen.queryByRole('link', { name: /Percorsi/ })).not.toBeInTheDocument()
  })

  /* La voce resta accesa anche dentro le pagine figlie: il singolo percorso
   * è dentro i propri percorsi, non accanto, e spegnerla lì farebbe sembrare
   * di essere usciti dalla sezione. */
  it('tiene accesa la voce anche nelle pagine figlie', () => {
    renderNavbar('user', '/app/percorsi/as-1')

    expect(screen.getByRole('link', { name: /Percorsi/ }).className).toContain('bg-violet-600/10')
    expect(screen.getByRole('link', { name: /Confronto/ }).className).not.toContain(
      'bg-violet-600/10',
    )
  })

  it('accende il simulatore anche mentre si svolge un test', () => {
    renderNavbar('user', '/app/simulatore/s-1')

    expect(screen.getByRole('link', { name: /Simulatore Tecnico/ }).className).toContain(
      'bg-violet-600/10',
    )
  })
})

describe('menu di chi è entrato', () => {
  it('si apre e si chiude', async () => {
    renderNavbar('user')

    await apriMenu()
    expect(screen.getByRole('link', { name: /Il Mio Profilo/ })).toBeInTheDocument()

    await apriMenu()
    expect(screen.queryByRole('link', { name: /Il Mio Profilo/ })).not.toBeInTheDocument()
  })

  it('mostra chi si è e con che ruolo', async () => {
    renderNavbar('super_admin')

    await apriMenu()

    expect(screen.getByText('anna@test.it')).toBeInTheDocument()
    expect(screen.getByText('Super Admin')).toBeInTheDocument()
  })

  /* A uno studente il menu non offre niente da amministrare: le voci ci
   * sarebbero solo per essere rifiutate dal server. */
  it('non offre niente da amministrare a uno studente', async () => {
    renderNavbar('user')

    await apriMenu()

    expect(screen.queryByRole('link', { name: /Gestione/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Report Attività/ })).not.toBeInTheDocument()
  })

  /* Un org admin governa le persone del proprio tenant: compone percorsi,
   * scrive i test tecnici e legge i report, ma non tocca utenti,
   * organizzazioni, avatar e registro, che sono del super admin. */
  it('a un org admin offre percorsi, simulazioni e report, non il resto', async () => {
    renderNavbar('organization_admin')

    await apriMenu()

    expect(screen.getByRole('link', { name: /Gestione Percorsi/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Gestione Simulazioni/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Report Attività/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Gestione Utenti/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Gestione Organizzazioni/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Gestione Avatar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Registro Attività/ })).not.toBeInTheDocument()
  })

  it('a un super admin offre tutto', async () => {
    renderNavbar('super_admin')

    await apriMenu()

    for (const voce of [
      /Gestione Utenti/,
      /Gestione Organizzazioni/,
      /Gestione Avatar/,
      /Gestione Simulazioni/,
      /Gestione Percorsi/,
      /Report Attività/,
      /Registro Attività/,
    ]) {
      expect(screen.getByRole('link', { name: voce })).toBeInTheDocument()
    }
  })

  it('esce e richiude il menu', async () => {
    renderNavbar('user')

    await apriMenu()
    await userEvent.click(screen.getByRole('button', { name: /Esci/ }))

    expect(logout).toHaveBeenCalledOnce()
    expect(screen.queryByRole('link', { name: /Il Mio Profilo/ })).not.toBeInTheDocument()
  })

  it('si chiude aprendo una delle sue voci', async () => {
    renderNavbar('user')

    await apriMenu()
    await userEvent.click(screen.getByRole('link', { name: /Il Mio Profilo/ }))

    expect(screen.queryByRole('link', { name: /Il Mio Profilo/ })).not.toBeInTheDocument()
  })
})
