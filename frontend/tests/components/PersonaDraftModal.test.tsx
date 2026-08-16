import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const draftPersona = vi.fn()
const stato = { isPending: false, error: null as Error | null }
vi.mock('../../src/hooks/useAdminAvatars', () => ({
  useDraftPersona: () => ({
    mutateAsync: draftPersona,
    reset: vi.fn(),
    get isPending() {
      return stato.isPending
    },
    get error() {
      return stato.error
    },
  }),
}))

import PersonaDraftModal from '../../src/components/PersonaDraftModal'

/* La modale da cui nasce una bozza di scheda. Quello che vale la pena
 * fissare non è il markup, sono le tre cose che decide da sola: quando la
 * generazione può partire, cosa manda al server, e cosa fa vedere quando il
 * fornitore non risponde. */

const CASO =
  'Un cliente vede due addebiti uguali sulla carta e chiama convinto di essere stato truffato.'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function renderModal(difficulty = '') {
  const onClose = vi.fn()
  const onDrafted = vi.fn()
  render(<PersonaDraftModal difficulty={difficulty} onClose={onClose} onDrafted={onDrafted} />, {
    wrapper,
  })
  return { onClose, onDrafted }
}

const bottone = () => screen.getByRole('button', { name: 'Genera la bozza' })

beforeEach(() => {
  draftPersona.mockReset()
  draftPersona.mockResolvedValue({ profile: { NOME: 'Mario' } })
  stato.isPending = false
  stato.error = null
})

describe('PersonaDraftModal', () => {
  /* Da tre parole il modello inventa un caso suo, che è esattamente quello
   * che chi genera una scheda non vuole: il bottone si spegne prima di
   * partire invece di far tornare un errore dal server. */
  it('non parte da un caso di due parole', async () => {
    renderModal()

    await userEvent.type(screen.getByLabelText('Il caso'), 'cliente arrabbiato')

    expect(bottone()).toBeDisabled()
    expect(screen.getByText(/Ancora \d+ caratteri/)).toBeInTheDocument()
  })

  it('parte quando il caso è raccontato', async () => {
    const { onDrafted } = renderModal()

    await userEvent.type(screen.getByLabelText('Il caso'), CASO)
    await userEvent.click(bottone())

    expect(draftPersona).toHaveBeenCalledWith({
      text: CASO,
      source: 'descrizione',
      difficulty: '',
    })
    expect(onDrafted).toHaveBeenCalledWith({ NOME: 'Mario' })
  })

  /* Le due fonti non sono due modi di dire la stessa cosa: da una
   * conversazione il modello ricava, da una descrizione inventa. */
  it('cambia fonte, e con lei il campo e le istruzioni', async () => {
    renderModal()

    await userEvent.click(screen.getByRole('radio', { name: 'Una Conversazione' }))

    expect(screen.getByLabelText('La conversazione')).toBeInTheDocument()
    expect(screen.getByText(/già priva dei dati identificativi/)).toBeInTheDocument()
  })

  it('manda la fonte scelta', async () => {
    renderModal()

    await userEvent.click(screen.getByRole('radio', { name: 'Una Conversazione' }))
    await userEvent.type(screen.getByLabelText('La conversazione'), CASO)
    await userEvent.click(bottone())

    expect(draftPersona).toHaveBeenCalledWith(expect.objectContaining({ source: 'conversazione' }))
  })

  /* Il grado guida la scheda, quindi parte da quello che c'è già nel form
   * invece di farlo scegliere due volte. */
  it('parte dal grado già scelto nella scheda', async () => {
    renderModal('8/10')

    await userEvent.type(screen.getByLabelText('Il caso'), CASO)
    await userEvent.click(bottone())

    expect(draftPersona).toHaveBeenCalledWith(expect.objectContaining({ difficulty: '8/10' }))
  })

  it('dice quando il fornitore non ha risposto', () => {
    stato.error = new Error('Errore nella generazione: modello non disponibile')
    renderModal()

    expect(screen.getByText(/modello non disponibile/)).toBeInTheDocument()
  })

  /* Venti secondi di attesa senza niente a schermo sono venti secondi in cui
   * si preme di nuovo. */
  it('mentre scrive lo dice, e non si può premere due volte', () => {
    stato.isPending = true
    renderModal()

    expect(screen.getByRole('button', { name: /Scrittura della scheda in corso/ })).toBeDisabled()
    expect(screen.getByText(/circa venti secondi/)).toBeInTheDocument()
  })
})
