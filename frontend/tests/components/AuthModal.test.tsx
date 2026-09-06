import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const login = vi.fn()
const completeNewPassword = vi.fn()
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ login, completeNewPassword }),
}))

import AuthModal from '../../src/components/AuthModal'

/* Le righe dell'elenco dei requisiti si distinguono dal pallino: pieno quando
 * il requisito è soddisfatto, vuoto quando manca ancora. */
const ACCESO = '●'
const SPENTO = '○'

function requisito(label: string) {
  return screen.getAllByRole('listitem').find((riga) => riga.textContent?.includes(label))
}

async function compilaEAccedi(email: string, password: string) {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Accedi' }))
}

describe('AuthModal', () => {
  beforeEach(() => {
    login.mockReset()
    completeNewPassword.mockReset()
  })

  it('chiude la modale quando le credenziali sono giuste', async () => {
    login.mockResolvedValue({ user: { id: '1' } })
    const onClose = vi.fn()
    render(<AuthModal onClose={onClose} />)

    await compilaEAccedi('mario@test.it', 'Password-Lunga1!')

    expect(login).toHaveBeenCalledWith('mario@test.it', 'Password-Lunga1!')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('mostra il motivo del rifiuto e lascia la modale aperta', async () => {
    login.mockRejectedValue(new Error('Credenziali non valide.'))
    const onClose = vi.fn()
    render(<AuthModal onClose={onClose} />)

    await compilaEAccedi('mario@test.it', 'sbagliata')

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenziali non valide.')
    expect(onClose).not.toHaveBeenCalled()
    // Il form resta compilabile: il tentativo fallito non blocca il pulsante
    expect(screen.getByRole('button', { name: 'Accedi' })).toBeEnabled()
  })

  /* Il primo accesso arriva con una password temporanea, e Cognito non emette
   * una sessione finché non ne viene scelta una vera. */
  it('passa alla scelta della password quando Cognito la impone', async () => {
    login.mockResolvedValue({ challenge: 'NEW_PASSWORD_REQUIRED', session: 'sess-1' })
    completeNewPassword.mockResolvedValue({ user: { id: '1' } })
    const onClose = vi.fn()
    render(<AuthModal onClose={onClose} />)

    await compilaEAccedi('mario@test.it', 'Temporanea1!')

    expect(await screen.findByText('Imposta Nuova Password')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Nuova Password'), 'Password-Lunga1!')
    await userEvent.type(screen.getByLabelText('Conferma Nuova Password'), 'Password-Lunga1!')
    await userEvent.click(screen.getByRole('button', { name: 'Imposta Password' }))

    // La sessione del challenge viaggia con la nuova password, altrimenti
    // Cognito non sa a quale accesso si riferisce
    expect(completeNewPassword).toHaveBeenCalledWith('mario@test.it', 'Password-Lunga1!', 'sess-1')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('rifiuta due password diverse senza chiamare il backend', async () => {
    login.mockResolvedValue({ challenge: 'NEW_PASSWORD_REQUIRED', session: 'sess-1' })
    render(<AuthModal onClose={vi.fn()} />)
    await compilaEAccedi('mario@test.it', 'Temporanea1!')
    await screen.findByText('Imposta Nuova Password')

    await userEvent.type(screen.getByLabelText('Nuova Password'), 'Password-Lunga1!')
    await userEvent.type(screen.getByLabelText('Conferma Nuova Password'), 'Password-Lunga2!')

    /* La coincidenza fra i due campi è una riga dell'elenco come le altre, e
     * finché quella riga è spenta il bottone resta chiuso: premerlo non
     * manda niente al backend. */
    expect(requisito('Le due password coincidono')).toHaveTextContent(SPENTO)
    const invia = screen.getByRole('button', { name: 'Imposta Password' })
    expect(invia).toBeDisabled()

    await userEvent.click(invia)

    expect(completeNewPassword).not.toHaveBeenCalled()
  })

  it('rifiuta una password che non rispetta i requisiti, e dice quali', async () => {
    login.mockResolvedValue({ challenge: 'NEW_PASSWORD_REQUIRED', session: 'sess-1' })
    render(<AuthModal onClose={vi.fn()} />)
    await compilaEAccedi('mario@test.it', 'Temporanea1!')
    await screen.findByText('Imposta Nuova Password')

    await userEvent.type(screen.getByLabelText('Nuova Password'), 'tuttaminuscola')
    await userEvent.type(screen.getByLabelText('Conferma Nuova Password'), 'tuttaminuscola')

    /* Cosa manca lo dice l'elenco, riga per riga, mentre resta acceso quello
     * che la password già rispetta. */
    expect(requisito('Una lettera maiuscola')).toHaveTextContent(SPENTO)
    expect(requisito('Un numero')).toHaveTextContent(SPENTO)
    expect(requisito('Una lettera minuscola')).toHaveTextContent(ACCESO)
    const invia = screen.getByRole('button', { name: 'Imposta Password' })
    expect(invia).toBeDisabled()

    await userEvent.click(invia)

    expect(completeNewPassword).not.toHaveBeenCalled()
  })
})
