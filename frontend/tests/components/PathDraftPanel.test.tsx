import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({ draftPath: vi.fn() }))
vi.mock('../../src/services/training', () => servizio)

import type { TrainingPathDraft } from '../../src/services/training'
import PathDraftPanel from '../../src/components/PathDraftPanel'

/* Il pannello ha due promesse: non manda al server un obiettivo troppo corto,
 * e quello che torna lo presenta come una proposta da rileggere invece che
 * come un percorso fatto. */

const OBIETTIVO =
  'Formare un nuovo addetto allo sportello, deve gestire i reclami sulle commissioni'

const proposta: TrainingPathDraft = {
  title: 'Onboarding sportello',
  description: 'Per chi comincia.',
  steps: [
    {
      avatar_id: 'a-1',
      simulation_id: null,
      target_score: 6,
      reason: 'Si comincia da un caso semplice.',
    },
    {
      avatar_id: null,
      simulation_id: 's-1',
      target_score: 7,
      reason: 'La procedura va saputa prima di gestire il cliente difficile.',
    },
  ],
}

/* Tipizzato e non `ReturnType<typeof vi.fn>`: il mock viene passato come
 * prop, e `tsc -b` controlla anche i test, dove un mock generico non
 * corrisponde alla firma che il componente dichiara. */
let onDrafted: (draft: TrainingPathDraft) => void

function renderPanel(organizationId = 'org-1') {
  onDrafted = vi.fn<(draft: TrainingPathDraft) => void>()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<PathDraftPanel organizationId={organizationId} onDrafted={onDrafted} />, {
    wrapper,
  })
}

beforeEach(() => {
  servizio.draftPath.mockReset().mockResolvedValue(proposta)
})

describe('PathDraftPanel', () => {
  /* Da tre parole il modello inventa un corso suo e mette in fila mezzo
   * catalogo: il minimo è la stessa regola del server, ripetuta qui solo per
   * dirlo prima di far partire una richiesta che verrebbe rifiutata. */
  it('non manda un obiettivo troppo corto', async () => {
    renderPanel()

    await userEvent.type(screen.getByLabelText(/Proposta Automatica/), 'un corso')

    expect(screen.getByRole('button', { name: /Proponi/ })).toBeDisabled()
    expect(servizio.draftPath).not.toHaveBeenCalled()
  })

  it('chiede la proposta sul catalogo del tenant scelto', async () => {
    renderPanel('org-7')

    await userEvent.type(screen.getByLabelText(/Proposta Automatica/), OBIETTIVO)
    await userEvent.click(screen.getByRole('button', { name: /Proponi/ }))

    await waitFor(() => expect(servizio.draftPath).toHaveBeenCalledWith(OBIETTIVO, 'org-7'))
    expect(onDrafted).toHaveBeenCalledWith(proposta)
  })

  /* Non è un messaggio di successo: in quel momento il form è pieno di roba
   * che non ha scritto nessuno, e la cosa da dire è quella. */
  it('dopo la proposta dice quante tappe sono e perché', async () => {
    renderPanel()

    await userEvent.type(screen.getByLabelText(/Proposta Automatica/), OBIETTIVO)
    await userEvent.click(screen.getByRole('button', { name: /Proponi/ }))

    expect(await screen.findByText(/da rileggere una per una/)).toBeInTheDocument()
    expect(screen.getByText('Si comincia da un caso semplice.')).toBeInTheDocument()
    expect(
      screen.getByText(/La procedura va saputa prima di gestire il cliente difficile/),
    ).toBeInTheDocument()
  })

  it("mostra l'errore del server invece di una proposta", async () => {
    servizio.draftPath.mockRejectedValue(new Error('Il catalogo è vuoto.'))
    renderPanel()

    await userEvent.type(screen.getByLabelText(/Proposta Automatica/), OBIETTIVO)
    await userEvent.click(screen.getByRole('button', { name: /Proponi/ }))

    expect(await screen.findByText('Il catalogo è vuoto.')).toBeInTheDocument()
    expect(onDrafted).not.toHaveBeenCalled()
  })

  /* Senza tenant scelto non c'è nessun catalogo da cui comporre. */
  it('resta spento finché non è stata scelta un organizzazione', async () => {
    renderPanel('')

    await userEvent.type(screen.getByLabelText(/Proposta Automatica/), OBIETTIVO)

    expect(screen.getByRole('button', { name: /Proponi/ })).toBeDisabled()
  })
})
