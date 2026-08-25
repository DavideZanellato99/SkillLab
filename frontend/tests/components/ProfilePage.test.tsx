import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateUser = vi.hoisted(() => vi.fn())
const utenteCorrente = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }))
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: utenteCorrente.current, updateUser }),
}))

const profileMutation = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null as Error | null,
}))
const passwordMutation = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null as Error | null,
}))
vi.mock('../../src/hooks/useProfile', () => ({
  useUpdateMyProfile: () => profileMutation,
  useChangeMyPassword: () => passwordMutation,
}))

const fetchMyDataExport = vi.hoisted(() => vi.fn())
vi.mock('../../src/services/profile', () => ({ fetchMyDataExport }))

const saveBlob = vi.hoisted(() => vi.fn())
vi.mock('../../src/services/api', () => ({ saveBlob }))

import ProfilePage from '../../src/components/ProfilePage'
import { SYSTEM_ACCOUNT_SUB } from '../../src/services/auth'

const utente = {
  id: 'u-1',
  cognito_sub: 'sub-1',
  email: 'anna@test.it',
  nome: 'Anna',
  cognome: 'Rossi',
  ruolo: 'user',
}

function renderPage(over: Record<string, unknown> = {}) {
  utenteCorrente.current = { ...utente, ...over }
  render(<ProfilePage />)
}

/* Nome e cognome li scrive solo chi amministra la piattaforma: le prove sul
 * salvataggio partono da lì, quelle sulla sola lettura dagli altri ruoli. */
const renderPageComeSuperAdmin = (over: Record<string, unknown> = {}) =>
  renderPage({ ruolo: 'super_admin', ...over })

const salva = () => screen.getByRole('button', { name: /Salva Modifiche/ })
const aggiorna = () => screen.getByRole('button', { name: /Aggiorna Password/ })

beforeEach(() => {
  updateUser.mockReset()
  profileMutation.mutateAsync.mockReset()
  profileMutation.mutateAsync.mockResolvedValue({ ...utente, nome: 'Annalisa' })
  profileMutation.reset.mockReset()
  profileMutation.isPending = false
  profileMutation.error = null
  passwordMutation.mutateAsync.mockReset()
  passwordMutation.mutateAsync.mockResolvedValue({ success: true })
  passwordMutation.reset.mockReset()
  passwordMutation.isPending = false
  passwordMutation.error = null
  fetchMyDataExport.mockReset()
  fetchMyDataExport.mockResolvedValue(new Blob(['x']))
  saveBlob.mockReset()
})

describe('i propri dati', () => {
  it('mostra chi si è e con che ruolo', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'Anna Rossi' })).toBeInTheDocument()
    expect(screen.getByText('Utente')).toBeInTheDocument()
  })

  it("ripiega sull'email quando il nome non c'è ancora", () => {
    renderPage({ nome: '', cognome: '' })

    expect(screen.getByRole('heading', { name: 'anna@test.it' })).toBeInTheDocument()
  })

  /* L'email non si cambia da qui: è l'identità dell'account su Cognito, e
   * un campo modificabile che poi il server rifiuta è peggio di uno spento. */
  it("tiene l'email in sola lettura", () => {
    renderPage()

    expect(screen.getByLabelText('Email')).toBeDisabled()
  })

  /* Il salvataggio resta spento finché non si cambia davvero qualcosa: un
   * pulsante vivo su un modulo intatto invita a una scrittura che non
   * scriverebbe niente. */
  it('tiene spento il salvataggio finché niente è cambiato', async () => {
    renderPageComeSuperAdmin()
    expect(salva()).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Nome'), 'lisa')

    expect(salva()).toBeEnabled()
  })

  it('salva nome e cognome senza spazi attorno', async () => {
    renderPageComeSuperAdmin()

    const nome = screen.getByLabelText('Nome')
    await userEvent.clear(nome)
    await userEvent.type(nome, '  Annalisa  ')
    await userEvent.click(salva())

    await waitFor(() =>
      expect(profileMutation.mutateAsync).toHaveBeenCalledWith({
        nome: 'Annalisa',
        cognome: 'Rossi',
      }),
    )
  })

  /* Il profilo di chi guarda vive nel contesto e non in cache: senza
   * allinearlo, la barra in alto continuerebbe a mostrare il nome vecchio. */
  it('allinea la sessione con il profilo salvato', async () => {
    renderPageComeSuperAdmin()

    await userEvent.type(screen.getByLabelText('Nome'), 'lisa')
    await userEvent.click(salva())

    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Annalisa' })),
    )
    expect(await screen.findByText('Dati aggiornati con successo.')).toBeInTheDocument()
  })

  /* Un nome fatto di soli spazi passa il campo obbligatorio del browser ma
   * non è un nome: senza il controllo qui arriverebbe al server, che lo
   * rifiuterebbe dopo un giro di rete. */
  it('rifiuta un nome fatto di soli spazi senza chiamare il server', async () => {
    renderPageComeSuperAdmin()

    const nome = screen.getByLabelText('Nome')
    await userEvent.clear(nome)
    await userEvent.type(nome, '   ')
    await userEvent.click(salva())

    expect(await screen.findByText('Nome e cognome non possono essere vuoti.')).toBeInTheDocument()
    expect(profileMutation.mutateAsync).not.toHaveBeenCalled()
  })

  it('mostra il motivo di un salvataggio rifiutato dal server', () => {
    profileMutation.error = new Error('Nome non valido.')
    renderPageComeSuperAdmin()

    expect(screen.getByText('Nome non valido.')).toBeInTheDocument()
  })

  /* L'anagrafica la tiene l'amministrazione: il nome che compare nei report
   * e nelle revisioni è quello registrato dall'organizzazione, quindi
   * l'interessato lo legge come legge l'email. */
  it.each([
    ['un utente', 'user'],
    ["un amministratore d'organizzazione", 'organization_admin'],
  ])('tiene nome e cognome in sola lettura per %s', (_, ruolo) => {
    renderPage({ ruolo })

    expect(screen.getByLabelText('Nome')).toBeDisabled()
    expect(screen.getByLabelText('Cognome')).toBeDisabled()
  })

  /* Un pulsante che non ha niente da salvare è solo un invito a un rifiuto:
   * dove i campi sono spenti, il salvataggio non c'è proprio. */
  it.each([['user'], ['organization_admin']])('non offre il salvataggio al ruolo %s', (ruolo) => {
    renderPage({ ruolo })

    expect(screen.queryByRole('button', { name: /Salva Modifiche/ })).not.toBeInTheDocument()
  })

  /* Due campi spenti senza una riga che dica perché mandano via chi era
   * arrivato fin qui per correggere il proprio cognome: la strada per farlo
   * correggere deve essere scritta accanto ai campi che non si toccano. */
  it.each([['user'], ['organization_admin']])(
    'dice al ruolo %s a chi rivolgersi per correggere il nome',
    (ruolo) => {
      renderPage({ ruolo })

      expect(screen.getByText(/rivolgiti a un amministratore/i)).toBeInTheDocument()
    },
  )

  it('non spiega niente a chi il nome se lo cambia da sé', () => {
    renderPageComeSuperAdmin()

    expect(screen.queryByText(/rivolgiti a un amministratore/i)).not.toBeInTheDocument()
  })

  /* Un messaggio verde parla del modulo com'era quando è comparso: lasciarlo
   * sopra a un campo già rimesso a mano lo farebbe leggere come la conferma
   * di quello che c'è scritto adesso. */
  it('toglie la conferma appena si torna a scrivere', async () => {
    renderPageComeSuperAdmin()

    await userEvent.type(screen.getByLabelText('Nome'), 'lisa')
    await userEvent.click(salva())
    expect(await screen.findByText('Dati aggiornati con successo.')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Cognome'), 'x')

    expect(screen.queryByText('Dati aggiornati con successo.')).not.toBeInTheDocument()
  })
})

describe('cambio password', () => {
  /* Il riscontro arriva quando si è finito di scrivere la conferma, non dopo
   * aver premuto: chi si accorge lì dello sbaglio corregge un campo invece di
   * ricompilare un modulo respinto. */
  it('avvisa che le due password non coincidono senza aspettare il pulsante', async () => {
    renderPage()

    await userEvent.type(screen.getByLabelText('Nuova Password'), 'Nuova-Lunga1!')
    await userEvent.type(screen.getByLabelText('Conferma Nuova Password'), 'Nuova-Lunga2!')
    await userEvent.tab()

    expect(await screen.findByText('Le nuove password non coincidono.')).toBeInTheDocument()
    expect(passwordMutation.mutateAsync).not.toHaveBeenCalled()
  })

  it("toglie l'avviso appena le due password coincidono", async () => {
    renderPage()

    await userEvent.type(screen.getByLabelText('Nuova Password'), 'Nuova-Lunga1!')
    const conferma = screen.getByLabelText('Conferma Nuova Password')
    await userEvent.type(conferma, 'Nuova-Lunga2!')
    await userEvent.tab()
    expect(await screen.findByText('Le nuove password non coincidono.')).toBeInTheDocument()

    await userEvent.clear(conferma)
    await userEvent.type(conferma, 'Nuova-Lunga1!')

    expect(screen.queryByText('Le nuove password non coincidono.')).not.toBeInTheDocument()
  })

  it('rifiuta due password che non coincidono', async () => {
    renderPage()

    await userEvent.type(screen.getByLabelText('Password Attuale'), 'Vecchia-1!')
    await userEvent.type(screen.getByLabelText('Nuova Password'), 'Nuova-Lunga1!')
    await userEvent.type(screen.getByLabelText('Conferma Nuova Password'), 'Nuova-Lunga2!')
    await userEvent.click(aggiorna())

    expect(await screen.findByText('Le nuove password non coincidono.')).toBeInTheDocument()
    expect(passwordMutation.mutateAsync).not.toHaveBeenCalled()
  })

  /* I requisiti si controllano qui prima di mandarla: sono gli stessi che
   * applica Cognito, e farli dire al server vorrebbe dire un giro di rete
   * per sapere che manca una maiuscola. */
  it('elenca i requisiti che la nuova password non rispetta', async () => {
    renderPage()

    await userEvent.type(screen.getByLabelText('Password Attuale'), 'Vecchia-1!')
    await userEvent.type(screen.getByLabelText('Nuova Password'), 'breve')
    await userEvent.type(screen.getByLabelText('Conferma Nuova Password'), 'breve')
    await userEvent.click(aggiorna())

    expect(await screen.findByText(/non soddisfa i requisiti/)).toBeInTheDocument()
    expect(passwordMutation.mutateAsync).not.toHaveBeenCalled()
  })

  it('cambia la password e svuota i campi', async () => {
    renderPage()

    await userEvent.type(screen.getByLabelText('Password Attuale'), 'Vecchia-1!')
    await userEvent.type(screen.getByLabelText('Nuova Password'), 'Nuova-Lunga1!')
    await userEvent.type(screen.getByLabelText('Conferma Nuova Password'), 'Nuova-Lunga1!')
    await userEvent.click(aggiorna())

    await waitFor(() =>
      expect(passwordMutation.mutateAsync).toHaveBeenCalledWith({
        current_password: 'Vecchia-1!',
        new_password: 'Nuova-Lunga1!',
      }),
    )
    expect(await screen.findByText('Password aggiornata con successo.')).toBeInTheDocument()
    expect(screen.getByLabelText('Password Attuale')).toHaveValue('')
    expect(screen.getByLabelText('Nuova Password')).toHaveValue('')
  })

  it('mostra il rifiuto del server', () => {
    passwordMutation.error = new Error('Password attuale errata.')
    renderPage()

    expect(screen.getByText('Password attuale errata.')).toBeInTheDocument()
  })

  /* L'account di sistema è la via di servizio che resta quando tutto il
   * resto non funziona: la sua password non passa da Cognito, quindi il
   * modulo non c'è proprio invece di fallire al salvataggio. */
  it("non offre il cambio password sull'account di sistema", () => {
    renderPage({ cognito_sub: SYSTEM_ACCOUNT_SUB })

    expect(screen.queryByLabelText('Password Attuale')).not.toBeInTheDocument()
    expect(
      screen.getByText("Non è possibile cambiare la password dell'account di sistema."),
    ).toBeInTheDocument()
  })

  it('accende i requisiti man mano che vengono rispettati', async () => {
    renderPage()

    await userEvent.type(screen.getByLabelText('Nuova Password'), 'Nuova-Lunga1!')

    const requisito = screen.getByText('Almeno 12 caratteri')
    expect(requisito.className).toContain('emerald')
  })
})

describe('copia dei propri dati', () => {
  it("scarica l'archivio con la data di oggi nel nome", async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /Scarica i Miei Dati/ }))

    await waitFor(() => expect(saveBlob).toHaveBeenCalled())
    const [, nomeFile] = saveBlob.mock.calls[0]
    expect(nomeFile).toMatch(/^dati-personali-\d{4}-\d{2}-\d{2}\.zip$/)
  })

  /* L'archivio porta dentro gli audio, quindi l'attesa può durare: lo
   * spinner dentro il bottone lo vede solo chi ha il bottone davanti, e chi
   * nel frattempo ha scorso la pagina deve trovare scritto che sta
   * succedendo qualcosa. */
  it("dice che l'archivio si sta preparando mentre si aspetta", async () => {
    fetchMyDataExport.mockReturnValue(new Promise(() => {}))
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /Scarica i Miei Dati/ }))

    expect(await screen.findByText(/L'archivio si sta preparando/)).toBeInTheDocument()
  })

  it("riporta un'esportazione fallita senza lasciare il bottone bloccato", async () => {
    fetchMyDataExport.mockRejectedValue(new Error('Archivio non disponibile.'))
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /Scarica i Miei Dati/ }))

    expect(await screen.findByText('Archivio non disponibile.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Scarica i Miei Dati/ })).toBeEnabled()
    expect(saveBlob).not.toHaveBeenCalled()
  })
})

/* Senza sessione la pagina non disegna niente: ci si arriva solo da dentro
 * l'app, e un modulo vuoto sarebbe un profilo di nessuno. */
it('non disegna niente senza sessione', () => {
  utenteCorrente.current = null
  const { container } = render(<ProfilePage />)

  expect(container).toBeEmptyDOMElement()
})
