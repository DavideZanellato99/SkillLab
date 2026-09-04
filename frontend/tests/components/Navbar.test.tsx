import { act, render, screen, within } from '@testing-library/react'
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
 * banco a quello che la barra decide, cioè chi vede cosa. Della campanella
 * resta il pulsante, perché è la barra a dire se il suo pannello è aperto. */
vi.mock('../../src/components/NotificationsBell', () => ({
  default: ({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) => (
    <div>
      <button onClick={onToggle}>campanella</button>
      {isOpen && <p>pannello notifiche</p>}
    </div>
  ),
}))
vi.mock('../../src/components/AuthModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div>
      modale di accesso<button onClick={onClose}>chiudi</button>
    </div>
  ),
}))

import Navbar from '../../src/components/Navbar'
import { MAIN_CONTENT_ID } from '../../src/components/mainContent'
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
    expect(screen.getByRole('link', { name: /Profilo/ })).toBeInTheDocument()

    await apriMenu()
    expect(screen.queryByRole('link', { name: /Profilo/ })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('link', { name: /Profilo/ })).not.toBeInTheDocument()
  })

  it('si chiude aprendo una delle sue voci', async () => {
    renderNavbar('user')

    await apriMenu()
    await userEvent.click(screen.getByRole('link', { name: /Profilo/ }))

    expect(screen.queryByRole('link', { name: /Profilo/ })).not.toBeInTheDocument()
  })
})

/* La chat di un avatar si apre dalla galleria e le appartiene: è la
 * schermata in cui si passa più tempo, e con la voce spenta la barra non
 * direbbe più dove si è. */
describe('la voce della galleria', () => {
  it('resta accesa mentre si parla con un avatar', () => {
    renderNavbar('user', '/app/chat/a-1')

    expect(screen.getByRole('link', { name: /Galleria Avatar/ }).className).toContain(
      'bg-violet-600/10',
    )
  })
})

/* Sotto i 768px le voci non stanno in fila: il pannello a comparsa è l'unico
 * modo di raggiungerle, e senza offrirebbe solo logo e profilo. */
describe('la navigazione su schermo stretto', () => {
  const apriPannello = () =>
    userEvent.click(screen.getByRole('button', { name: 'Apri il menu di navigazione' }))

  it('offre le stesse sezioni della fila', async () => {
    renderNavbar('user')
    await apriPannello()

    const pannello = screen.getByRole('navigation', { name: 'Sezioni' })
    for (const voce of [/Galleria Avatar/, /Simulatore Tecnico/, /Percorsi/, /Confronto/]) {
      expect(within(pannello).getByRole('link', { name: voce })).toBeInTheDocument()
    }
  })

  it('mostra a ciascuno le proprie', async () => {
    renderNavbar('organization_admin')
    await apriPannello()

    const pannello = screen.getByRole('navigation', { name: 'Sezioni' })
    expect(within(pannello).getByRole('link', { name: /Dashboard/ })).toBeInTheDocument()
    expect(within(pannello).queryByRole('link', { name: /Percorsi/ })).not.toBeInTheDocument()
  })

  it('si chiude aprendo una sezione', async () => {
    renderNavbar('user')
    await apriPannello()

    const pannello = screen.getByRole('navigation', { name: 'Sezioni' })
    await userEvent.click(within(pannello).getByRole('link', { name: /Confronto/ }))

    expect(screen.queryByRole('navigation', { name: 'Sezioni' })).not.toBeInTheDocument()
  })

  it('si chiude con Esc, e il fuoco torna al suo pulsante', async () => {
    renderNavbar('user')
    await apriPannello()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('navigation', { name: 'Sezioni' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apri il menu di navigazione' })).toHaveFocus()
  })

  /* Prima dell'accesso la barra ha una voce sola, che sta in fila a
   * qualunque larghezza: nessun pannello da aprire. */
  it('non compare prima di entrare', () => {
    renderNavbar(null)

    expect(
      screen.queryByRole('button', { name: 'Apri il menu di navigazione' }),
    ).not.toBeInTheDocument()
  })
})

describe('il menu del profilo, da tastiera', () => {
  it('si chiude con Esc', async () => {
    renderNavbar('user')
    await apriMenu()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('link', { name: /Profilo/ })).not.toBeInTheDocument()
  })

  it('dice se è aperto a chi non lo vede', async () => {
    renderNavbar('user')

    expect(menuUtente()).toHaveAttribute('aria-expanded', 'false')
    await apriMenu()
    expect(menuUtente()).toHaveAttribute('aria-expanded', 'true')
  })

  /* Chiuso il menu il fuoco tornerebbe sul body, cioè in cima alla pagina:
   * il Tab successivo ricomincerebbe dal salto al contenuto invece di
   * riprendere da dove si era. */
  it('con Esc il fuoco torna al pulsante che lo aveva aperto', async () => {
    renderNavbar('user')
    await apriMenu()

    await userEvent.keyboard('{Escape}')

    expect(menuUtente()).toHaveFocus()
  })

  /* Il nome resta il nome del pulsante anche dove non si legge: sotto i
   * 480px sparisce per far posto, e resterebbero due lettere. */
  it('porta il nome di chi è entrato anche per chi non lo vede', () => {
    renderNavbar('user')

    expect(
      screen.getByRole('button', { name: 'Anna Rossi, menu del proprio account' }),
    ).toBeInTheDocument()
  })
})

/* I tre pannelli escono dallo stesso angolo: aperti insieme si
 * coprirebbero. */
describe('i pannelli della barra', () => {
  it('aprendo le sezioni si chiude il profilo', async () => {
    renderNavbar('user')

    await apriMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Apri il menu di navigazione' }))

    expect(screen.getByRole('navigation', { name: 'Sezioni' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Profilo/ })).not.toBeInTheDocument()
  })

  it('aprendo il profilo si chiudono le sezioni', async () => {
    renderNavbar('user')

    await userEvent.click(screen.getByRole('button', { name: 'Apri il menu di navigazione' }))
    await apriMenu()

    expect(screen.getByRole('link', { name: /Profilo/ })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Sezioni' })).not.toBeInTheDocument()
  })

  it('aprendo le notifiche si chiude il profilo', async () => {
    renderNavbar('user')

    await apriMenu()
    await userEvent.click(screen.getByRole('button', { name: 'campanella' }))

    expect(screen.getByText('pannello notifiche')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Profilo/ })).not.toBeInTheDocument()
  })

  it('aprendo il profilo si chiudono le notifiche', async () => {
    renderNavbar('user')

    await userEvent.click(screen.getByRole('button', { name: 'campanella' }))
    await apriMenu()

    expect(screen.getByRole('link', { name: /Profilo/ })).toBeInTheDocument()
    expect(screen.queryByText('pannello notifiche')).not.toBeInTheDocument()
  })

  /* Cambiando pagina non resta niente di aperto sopra la schermata nuova. */
  it('le notifiche si chiudono cambiando sezione', async () => {
    renderNavbar('user')

    await userEvent.click(screen.getByRole('button', { name: 'campanella' }))
    await userEvent.click(screen.getByRole('link', { name: /Confronto/ }))

    expect(screen.queryByText('pannello notifiche')).not.toBeInTheDocument()
  })
})

/* La barra sta in cima a ogni pagina e con essa tutte le sue voci: senza il
 * salto, chi naviga da tastiera le riattraversa a ogni cambio di schermata
 * prima di arrivare al contenuto. */
describe('il salto al contenuto', () => {
  const salto = () => screen.getByRole('link', { name: 'Salta al contenuto' })

  it('è la prima cosa che si raggiunge con Tab', async () => {
    renderNavbar('user')

    await userEvent.tab()

    expect(salto()).toHaveFocus()
  })

  it('porta il fuoco sul contenuto della pagina', async () => {
    renderNavbar('user')
    const main = document.createElement('main')
    main.id = MAIN_CONTENT_ID
    main.tabIndex = -1
    main.scrollIntoView = vi.fn()
    document.body.appendChild(main)

    await userEvent.click(salto())

    expect(main).toHaveFocus()
    /* L'indirizzo resta pulito: il salto non è un posto in cui si torna, e
       un href scritto nella barra finirebbe nei segnalibri. */
    expect(window.location.hash).toBe('')

    main.remove()
  })

  /* Il fuoco si sposta a mano, quindi senza il bersaglio non c'è niente da
     fare: nessun errore, e la pagina resta dov'è. */
  it('non fa niente dove il contenuto non è ancora montato', async () => {
    renderNavbar('user')

    await userEvent.click(salto())

    expect(salto()).toBeInTheDocument()
  })
})
