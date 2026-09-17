import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessione = vi.hoisted(() => ({ current: { ruolo: 'user' } }))
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: sessione.current }) }))

const stato = vi.hoisted(() => ({
  people: [] as unknown[],
  peopleQuery: { isPending: false, error: null as unknown },
  attempts: { data: [] as unknown[], isPending: false, error: null as unknown },
  simulations: { data: [] as unknown[], isPending: false, error: null as unknown },
  chiesto: { subjectId: '' },
  soggetto: null as Record<string, unknown> | null,
  suggerimento: undefined as string | undefined,
}))
vi.mock('../../src/hooks/useComparison', () => ({
  useComparableUsers: (enabled: boolean) => ({
    data: enabled ? stato.people : [],
    ...stato.peopleQuery,
  }),
  useAttempts: (subjectId: string) => {
    stato.chiesto.subjectId = subjectId
    return stato.attempts
  },
  useSimulationAttempts: () => stato.simulations,
}))

/* Le due viste hanno i loro test: qui interessa quale delle due la pagina
 * mette davanti, non come disegnano i tentativi. */
vi.mock('../../src/components/ComparisonConversations', () => ({
  default: ({
    attempts,
    subject,
    emptyHint,
  }: {
    attempts: unknown[]
    subject: Record<string, unknown>
    emptyHint?: string
  }) => {
    stato.soggetto = subject
    stato.suggerimento = emptyHint
    return <div>conversazioni: {attempts.length}</div>
  },
}))
vi.mock('../../src/components/ComparisonSimulations', () => ({
  default: ({ attempts, emptyHint }: { attempts: unknown[]; emptyHint?: string }) => {
    stato.suggerimento = emptyHint
    return <div>simulazioni: {attempts.length}</div>
  },
}))
/* La seconda sezione ha i suoi test: qui interessa a chi la pagina la mostra
 * e quale prova le dice di guardare. Disegna la linguetta di primo livello
 * che la pagina le passa, altrimenti da lì non si tornerebbe indietro. */
vi.mock('../../src/components/ComparisonUsers', () => ({
  default: ({ prova, sectionTabs }: { prova: string; sectionTabs: ReactNode }) => (
    <>
      {sectionTabs}
      <div>confronto utenti: {prova}</div>
    </>
  ),
}))

import ComparisonPage from '../../src/components/ComparisonPage'

/* L'indirizzo è dove la pagina tiene la persona e la linguetta, quindi va
 * letto: è quello che si manda a un collega e quello su cui torna il tasto
 * indietro. */
function Indirizzo() {
  const { search } = useLocation()
  return <div data-testid="indirizzo">{search}</div>
}
const indirizzo = () => screen.getByTestId('indirizzo').textContent

function renderPage(ruolo = 'user', percorso = '/app/confronto') {
  sessione.current = { ruolo }
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <ComparisonPage />
      <Indirizzo />
    </MemoryRouter>,
  )
}

const campoPersona = () => screen.getByRole('combobox')

beforeEach(() => {
  stato.people = [
    { id: 'u-2', nome: 'Marco', cognome: 'Bianchi', email: 'marco@test.it', attempts: 4 },
  ]
  stato.peopleQuery = { isPending: false, error: null }
  stato.attempts = { data: [{ conversation_id: 'c-1' }], isPending: false, error: null }
  stato.simulations = { data: [], isPending: false, error: null }
  stato.chiesto.subjectId = ''
  stato.suggerimento = undefined
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

  it('un admin cerca fra le persone del proprio tenant', async () => {
    renderPage('organization_admin')

    expect(screen.getByText(/Seleziona una persona/)).toBeInTheDocument()
    await userEvent.click(campoPersona())
    expect(screen.getByRole('option', { name: /Marco Bianchi/ })).toBeInTheDocument()
  })

  /* Sotto al nome soltanto l'email, che distingue due omonimi: quante prove
     ha si legge nelle linguette appena scelto, e accanto all'indirizzo
     allungava ogni voce senza cambiare chi si sta cercando. */
  it("mostra solo l'email sotto al nome", async () => {
    renderPage('organization_admin')

    await userEvent.click(campoPersona())

    expect(screen.getByText('marco@test.it')).toBeInTheDocument()
    expect(screen.queryByText(/prove$/)).not.toBeInTheDocument()
  })

  /* Per cognome, come nella tabella di gestione utenti e come nelle tendine
     della dashboard (vedi `personOrder`): un elenco di persone si scorre
     cercando il cognome, e le stesse persone ordinate in due modi in due
     schermate si leggono come due elenchi diversi. */
  it('elenca le persone in ordine alfabetico per cognome', async () => {
    stato.people = [
      { id: 'u-3', nome: 'Sara', cognome: 'Alberti', email: 'sara@test.it', attempts: 2 },
      { id: 'u-2', nome: 'Marco', cognome: 'Bianchi', email: 'marco@test.it', attempts: 4 },
      { id: 'u-4', nome: 'Anna', cognome: 'Conti', email: 'anna@test.it', attempts: 1 },
    ]
    renderPage('organization_admin')

    await userEvent.click(campoPersona())

    const nomi = screen.getAllByRole('option').map((o) => o.textContent)
    expect(nomi).toEqual([
      expect.stringContaining('Sara Alberti'),
      expect.stringContaining('Marco Bianchi'),
      expect.stringContaining('Anna Conti'),
    ])
  })

  it('parte dalle proprie prove anche per un admin', () => {
    renderPage('organization_admin')

    expect(screen.getByText('Le Mie Prove')).toBeInTheDocument()
    expect(stato.chiesto.subjectId).toBe('')
  })

  it('scegliere una persona la scrive nell’indirizzo', async () => {
    renderPage('organization_admin')

    await userEvent.click(campoPersona())
    await userEvent.click(screen.getByRole('option', { name: /Marco Bianchi/ }))

    expect(stato.chiesto.subjectId).toBe('u-2')
    expect(indirizzo()).toContain('persona=u-2')
  })

  it('riapre sulla persona che l’indirizzo porta con sé', () => {
    renderPage('organization_admin', '/app/confronto?persona=u-2')

    expect(stato.chiesto.subjectId).toBe('u-2')
    expect(stato.soggetto).toMatchObject({ isSelf: false, nome: 'Marco' })
  })

  /* A uno studente il server risponderebbe comunque con le proprie prove:
     la pagina non deve intanto scriversi accanto al titolo un altro nome. */
  it('a uno studente la persona nell’indirizzo non serve a niente', () => {
    renderPage('user', '/app/confronto?persona=u-2')

    expect(stato.chiesto.subjectId).toBe('')
    expect(stato.soggetto).toMatchObject({ isSelf: true })
  })

  /* Di chi sono le prove serve alla metà parlata per aprire la trascrizione:
     le proprie e quelle di un'altra persona si leggono da due endpoint
     diversi, e l'intestazione dice chi ha parlato. */
  it('dice alla metà parlata di chi sono le prove', async () => {
    renderPage('organization_admin')
    expect(stato.soggetto).toMatchObject({ isSelf: true })

    await userEvent.click(campoPersona())
    await userEvent.click(screen.getByRole('option', { name: /Marco Bianchi/ }))

    expect(stato.soggetto).toMatchObject({
      isSelf: false,
      nome: 'Marco',
      cognome: 'Bianchi',
      email: 'marco@test.it',
    })
  })
})

/* Un admin che non si allena atterra sulle proprie prove, che sono zero: il
 * riquadro vuoto da solo gli direbbe che non c'è niente da confrontare
 * mentre le prove della sua gente sono a un gesto di distanza. */
describe('quando non c’è niente da confrontare', () => {
  it('indica il selettore a chi può scegliere una persona', () => {
    stato.attempts = { data: [], isPending: false, error: null }
    renderPage('organization_admin')

    expect(stato.suggerimento).toBe('Scegli una persona qui sopra per leggere le sue prove')
  })

  it('non indica niente a uno studente', () => {
    stato.attempts = { data: [], isPending: false, error: null }
    renderPage()

    expect(stato.suggerimento).toBeUndefined()
  })

  /* Manderebbe a un elenco vuoto: l'admin è il primo del suo tenant e non ha
     ancora nessuno da guardare. */
  it('non indica niente quando non c’è nessuno da scegliere', () => {
    stato.people = []
    stato.attempts = { data: [], isPending: false, error: null }
    renderPage('organization_admin')

    expect(stato.suggerimento).toBeUndefined()
  })

  it('non indica niente mentre si guardano le prove di qualcuno', () => {
    stato.attempts = { data: [], isPending: false, error: null }
    renderPage('organization_admin', '/app/confronto?persona=u-2')

    expect(stato.suggerimento).toBeUndefined()
  })
})

/* Una linguetta per prova: una conversazione valutata e un test tecnico si
 * guardano una per volta, perché il miglioramento in una non dice niente
 * dell'altra. */
describe('le due prove', () => {
  /* Solo il nome della prova: quante ne ha la persona scelta si legge
     nell'elenco appena sotto. */
  it('nomina le due prove senza contarle', () => {
    stato.simulations = {
      data: [{ attempt_id: 't-1' }, { attempt_id: 't-2' }],
      isPending: false,
      error: null,
    }
    renderPage()

    expect(screen.getByRole('tab', { name: 'Conversazioni' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Simulazioni tecniche' })).toBeInTheDocument()
  })

  it('si apre sulle conversazioni', () => {
    renderPage()

    expect(screen.getByText('conversazioni: 1')).toBeInTheDocument()
  })

  it('passa ai test tecnici e lo scrive nell’indirizzo', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('tab', { name: /Simulazioni tecniche/ }))

    expect(screen.getByText('simulazioni: 0')).toBeInTheDocument()
    expect(screen.queryByText(/^conversazioni:/)).not.toBeInTheDocument()
    expect(indirizzo()).toContain('prova=simulazioni')
  })

  it('riapre sulla linguetta che l’indirizzo porta con sé', () => {
    renderPage('user', '/app/confronto?prova=simulazioni')

    expect(screen.getByText('simulazioni: 0')).toBeInTheDocument()
  })

  it('lega ogni linguetta al contenuto che comanda', () => {
    renderPage()

    const linguetta = screen.getByRole('tab', { name: /Conversazioni/ })
    expect(linguetta).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'id',
      linguetta.getAttribute('aria-controls'),
    )
  })
})

/* Le due sezioni sono due linguette, e il titolo della pagina è quello della
 * sezione aperta. Le medie di più persone sono una domanda che si fa chi
 * amministra: uno studente ha sé stesso e nessun altro, e la classifica
 * dell'aula non è una cosa che gli si mostra, quindi non ha nemmeno la
 * linguetta per arrivarci. */
describe('le due sezioni', () => {
  const linguettaUtenti = () => screen.getByRole('tab', { name: 'Tra utenti' })

  it('si apre sui tentativi, con il loro titolo', () => {
    renderPage('organization_admin')

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Confronto tra i Tentativi')
    expect(screen.getByRole('tab', { name: 'Tra tentativi' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.queryByText(/confronto utenti/)).not.toBeInTheDocument()
  })

  it('un admin passa al confronto tra utenti e lo scrive nell’indirizzo', async () => {
    renderPage('organization_admin')

    await userEvent.click(linguettaUtenti())

    expect(screen.getByText('confronto utenti: conversazioni')).toBeInTheDocument()
    expect(screen.queryByText(/^conversazioni:/)).not.toBeInTheDocument()
    expect(indirizzo()).toContain('sezione=utenti')
  })

  it('riapre sulla sezione che l’indirizzo porta con sé', () => {
    renderPage('organization_admin', '/app/confronto?sezione=utenti')

    expect(screen.getByText('confronto utenti: conversazioni')).toBeInTheDocument()
  })

  /* I link composti quando le due sezioni erano due riquadri della stessa
     pagina portano le persone e nessuna sezione: devono aprirsi ancora sul
     grafico che portano. */
  it('un indirizzo con le persone scelte e senza sezione apre sugli utenti', () => {
    renderPage('organization_admin', '/app/confronto?confronto=u-2,u-3')

    expect(screen.getByText('confronto utenti: conversazioni')).toBeInTheDocument()
  })

  it('uno studente non ha la seconda sezione né la linguetta', () => {
    renderPage('user', '/app/confronto?sezione=utenti')

    expect(screen.queryByRole('tab', { name: 'Tra utenti' })).not.toBeInTheDocument()
    expect(screen.queryByText(/confronto utenti/)).not.toBeInTheDocument()
    expect(screen.getByText('conversazioni: 1')).toBeInTheDocument()
  })

  /* La prova è una sola per tutte e due le sezioni: passando dall'una
     all'altra si resta su quella. */
  it('la seconda sezione guarda la stessa prova della prima', async () => {
    renderPage('organization_admin')

    await userEvent.click(screen.getByRole('tab', { name: /Simulazioni tecniche/ }))
    await userEvent.click(linguettaUtenti())

    expect(screen.getByText('confronto utenti: simulazioni')).toBeInTheDocument()
  })
})

describe('caricamento ed errori', () => {
  /* Le due chiamate partono insieme, ma legarle faceva aspettare alle
     conversazioni, che sono la linguetta aperta, un elenco che in quel
     momento nessuno sta guardando. */
  it('non fa aspettare una metà per i dati dell’altra', () => {
    stato.simulations = { data: [], isPending: true, error: null }
    renderPage()

    expect(screen.getByText('conversazioni: 1')).toBeInTheDocument()
    expect(screen.queryByText('Caricamento tentativi...')).not.toBeInTheDocument()
  })

  it('aspetta i propri dati', () => {
    stato.attempts = { data: [], isPending: true, error: null }
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

  /* Falliva in silenzio: restava un selettore con dentro le sole proprie
     prove, e nessuna spiegazione. */
  it("riporta l'elenco delle persone caduto", () => {
    stato.peopleQuery = { isPending: false, error: new Error('guasto') }
    renderPage('organization_admin')

    expect(screen.getByText('Impossibile caricare le persone da confrontare.')).toBeInTheDocument()
  })

  it("ripiega su un messaggio suo quando l'errore non ne porta uno", () => {
    stato.attempts = { data: [], isPending: false, error: 'guasto' }
    renderPage()

    expect(screen.getByText('Impossibile caricare i tentativi.')).toBeInTheDocument()
  })
})
