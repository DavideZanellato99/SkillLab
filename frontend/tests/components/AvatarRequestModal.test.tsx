import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* La modale con cui un organization admin chiede un avatar: le regole che
 * il server non conosce (un caso raccontato davvero, non due richieste per
 * la stessa persona), cosa parte quando è tutto a posto e cosa resta a
 * schermo dopo, visto che la modale non si chiude. L'elenco delle richieste
 * già mandate ha i suoi test: qui conta solo quando compare. */

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
vi.mock('../../src/components/AvatarRequestsList', () => ({
  default: ({
    requests,
    onRemoved,
  }: {
    requests: { first_name: string }[]
    onRemoved: (message: string) => void
  }) => (
    <div>
      elenco di {requests.map((r) => r.first_name).join(', ')}
      <button onClick={() => onRemoved('Richiesta rimossa.')}>rimuovi</button>
    </div>
  ),
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
  it('manda i campi ripuliti, conferma passando all’elenco e svuota il modulo', async () => {
    const onClose = vi.fn()
    /* La richiesta appena mandata: l'hook è finto, quindi l'elenco non si
     * rinfresca da solo e il test la mette lì a mano. */
    invia.mutateAsync.mockImplementation(async (payload) => {
      stato.richieste = [{ ...payload, status: 'pending' }]
      return { id: 'r-1', ...payload }
    })
    render(<AvatarRequestModal onClose={onClose} />)

    await compila()
    await inviaClick()

    expect(invia.mutateAsync).toHaveBeenCalledWith({
      first_name: 'Giovanni',
      last_name: 'Salemmi',
      category: 'Sportello reclami',
      scenario_type: 'Reclamo',
      problem: PROBLEMA,
    })
    expect(await screen.findByText(/Richiesta per Giovanni Salemmi inviata/)).toBeInTheDocument()
    expect(screen.getByText('elenco di Giovanni')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('radio', { name: 'Nuova richiesta' }))
    expect(screen.getByLabelText('Nome')).toHaveValue('')
    expect(screen.getByLabelText('Problematica')).toHaveValue('')
  })

  it('senza richieste aperte mostra solo il modulo, senza schede', () => {
    stato.richieste = [{ first_name: 'Mario', last_name: 'Verdi', status: 'published' }]
    render(<AvatarRequestModal onClose={() => {}} />)

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.queryByText(/elenco di/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toBeInTheDocument()
  })

  it('con richieste aperte le schede portano all’elenco, dove il ritiro si conferma', async () => {
    stato.richieste = [
      { first_name: 'Giovanni', last_name: 'Salemmi', status: 'pending' },
      { first_name: 'Luisa', last_name: 'Bianchi', status: 'rejected' },
      { first_name: 'Mario', last_name: 'Verdi', status: 'published' },
    ]
    render(<AvatarRequestModal onClose={() => {}} />)

    // Si parte dal modulo, l'elenco è dietro la sua scheda con il conteggio
    expect(screen.getByLabelText('Nome')).toBeInTheDocument()
    expect(screen.queryByText(/elenco di/)).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^Richieste inviate\s*2$/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: /^Richieste inviate\s*2$/ }))
    expect(screen.getByText('elenco di Giovanni, Luisa')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'rimuovi' }))
    expect(screen.getByText('Richiesta rimossa.')).toBeInTheDocument()
  })

  it('ritirata l’ultima richiesta le schede spariscono e resta il modulo', async () => {
    stato.richieste = [{ first_name: 'Giovanni', last_name: 'Salemmi', status: 'pending' }]
    const { rerender } = render(<AvatarRequestModal onClose={() => {}} />)
    await userEvent.click(screen.getByRole('radio', { name: /^Richieste inviate\s*1$/ }))

    stato.richieste = []
    rerender(<AvatarRequestModal onClose={() => {}} />)

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toBeInTheDocument()
  })

  it('pretende un caso raccontato, non tre parole', async () => {
    render(<AvatarRequestModal onClose={() => {}} />)

    await compila({ problema: 'Un reclamo.' })
    await inviaClick()

    expect(screen.getByText(/almeno 40 caratteri/)).toBeInTheDocument()
    expect(invia.mutateAsync).not.toHaveBeenCalled()
  })

  it('non manda due richieste in attesa per la stessa persona', async () => {
    stato.richieste = [{ first_name: 'giovanni', last_name: 'SALEMMI', status: 'pending' }]
    render(<AvatarRequestModal onClose={() => {}} />)

    await compila()
    await inviaClick()

    expect(screen.getByText(/è già in attesa/)).toBeInTheDocument()
    expect(invia.mutateAsync).not.toHaveBeenCalled()
  })

  it('una richiesta già chiusa per quella persona non blocca', async () => {
    stato.richieste = [{ first_name: 'Giovanni', last_name: 'Salemmi', status: 'rejected' }]
    render(<AvatarRequestModal onClose={() => {}} />)

    await compila()
    await inviaClick()

    expect(invia.mutateAsync).toHaveBeenCalled()
  })

  it('mostra il rifiuto del server senza chiudersi né svuotare', async () => {
    invia.mutateAsync.mockRejectedValue(new Error('Organizzazione sospesa.'))
    invia.error = new Error('Organizzazione sospesa.')
    render(<AvatarRequestModal onClose={() => {}} />)

    await compila()
    await inviaClick()

    expect(screen.getByText('Organizzazione sospesa.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveValue('Giovanni')
  })
})
