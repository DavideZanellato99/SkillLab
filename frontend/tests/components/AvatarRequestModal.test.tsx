import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* Il form con cui un organization admin chiede un avatar: le regole che il
 * server non conosce (un caso raccontato davvero, non due richieste per la
 * stessa persona) e cosa parte quando è tutto a posto. La categoria è testo
 * libero, quindi qui non c'è nessun elenco da cui pescare. */

const invia = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null as Error | null,
}))
const stato = vi.hoisted(() => ({ richieste: [] as unknown[] }))
vi.mock('../../src/hooks/useAvatarRequests', () => ({
  useAvatarRequests: () => ({ data: stato.richieste }),
  useCreateAvatarRequest: () => invia,
}))
import AvatarRequestModal from '../../src/components/AvatarRequestModal'

const PROBLEMA =
  'Vede due addebiti uguali sulla carta nello stesso giorno e chiama convinto di essere stato truffato.'

async function compila({ problema = PROBLEMA } = {}) {
  await userEvent.type(screen.getByLabelText('Nome'), 'Giovanni')
  await userEvent.type(screen.getByLabelText('Cognome'), 'Salemmi')
  await userEvent.type(screen.getByLabelText('Categoria'), ' Sportello reclami ')
  await userEvent.type(screen.getByLabelText('Tipo di scenario'), 'Reclamo')
  await incolla(screen.getByLabelText('Problematica'), problema)
}

/* Incollato e non digitato: un caso raccontato sono cento caratteri, e
 * digitarli uno per uno in jsdom sotto il carico della suite intera sfora
 * il tempo massimo del test senza provare niente di più. */
async function incolla(campo: HTMLElement, testo: string) {
  await userEvent.click(campo)
  await userEvent.paste(testo)
}

const inviaClick = () => userEvent.click(screen.getByRole('button', { name: 'Invia la Richiesta' }))

beforeEach(() => {
  stato.richieste = []
  invia.mutateAsync.mockReset()
  invia.mutateAsync.mockImplementation(async (payload) => ({ id: 'r-1', ...payload }))
  invia.reset.mockReset()
  invia.error = null
})

describe('AvatarRequestModal', () => {
  it('manda i campi ripuliti e consegna la richiesta', async () => {
    const onSent = vi.fn()
    render(<AvatarRequestModal onClose={() => {}} onSent={onSent} />)

    await compila()
    await inviaClick()

    expect(invia.mutateAsync).toHaveBeenCalledWith({
      first_name: 'Giovanni',
      last_name: 'Salemmi',
      category: 'Sportello reclami',
      scenario_type: 'Reclamo',
      problem: PROBLEMA,
    })
    expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ id: 'r-1' }))
  })

  it('pretende un caso raccontato, non tre parole', async () => {
    render(<AvatarRequestModal onClose={() => {}} onSent={() => {}} />)

    await compila({ problema: 'Un reclamo.' })
    await inviaClick()

    expect(screen.getByText(/almeno 40 caratteri/)).toBeInTheDocument()
    expect(invia.mutateAsync).not.toHaveBeenCalled()
  })

  it('non manda due richieste in attesa per la stessa persona', async () => {
    stato.richieste = [{ first_name: 'giovanni', last_name: 'SALEMMI', status: 'pending' }]
    render(<AvatarRequestModal onClose={() => {}} onSent={() => {}} />)

    await compila()
    await inviaClick()

    expect(screen.getByText(/è già in attesa/)).toBeInTheDocument()
    expect(invia.mutateAsync).not.toHaveBeenCalled()
  })

  it('una richiesta già chiusa per quella persona non blocca', async () => {
    stato.richieste = [{ first_name: 'Giovanni', last_name: 'Salemmi', status: 'rejected' }]
    render(<AvatarRequestModal onClose={() => {}} onSent={() => {}} />)

    await compila()
    await inviaClick()

    expect(invia.mutateAsync).toHaveBeenCalled()
  })

  it('mostra il rifiuto del server senza chiudersi', async () => {
    invia.mutateAsync.mockRejectedValue(new Error('Organizzazione sospesa.'))
    invia.error = new Error('Organizzazione sospesa.')
    const onSent = vi.fn()
    render(<AvatarRequestModal onClose={() => {}} onSent={onSent} />)

    await compila()
    await inviaClick()

    expect(screen.getByText('Organizzazione sospesa.')).toBeInTheDocument()
    expect(onSent).not.toHaveBeenCalled()
  })
})
