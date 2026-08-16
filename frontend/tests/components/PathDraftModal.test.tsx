import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({ draftPath: vi.fn() }))
vi.mock('../../src/services/training', () => servizio)

import type { TrainingPathDraft } from '../../src/services/training'
import PathDraftModal from '../../src/components/PathDraftModal'

/* La finestra da cui nasce una proposta di percorso. Le promesse sono tre:
 * non manda al server un obiettivo troppo corto, chiede la proposta sul
 * catalogo del tenant scelto, e si toglie di mezzo appena l'ha consegnata,
 * perché quello che c'è da rileggere sta nel form dietro. */

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

/* Tipizzati e non `ReturnType<typeof vi.fn>`: i mock vengono passati come
 * prop, e `tsc -b` controlla anche i test, dove un mock generico non
 * corrisponde alla firma che il componente dichiara. */
let onDrafted: (draft: TrainingPathDraft) => void
let onClose: () => void

function renderModal(organizationId = 'org-1') {
  onDrafted = vi.fn<(draft: TrainingPathDraft) => void>()
  onClose = vi.fn<() => void>()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(
    <PathDraftModal organizationId={organizationId} onClose={onClose} onDrafted={onDrafted} />,
    { wrapper },
  )
}

beforeEach(() => {
  servizio.draftPath.mockReset().mockResolvedValue(proposta)
})

describe('PathDraftModal', () => {
  /* Da tre parole il modello inventa un corso suo e mette in fila mezzo
   * catalogo: il minimo è la stessa regola del server, ripetuta qui solo per
   * dirlo prima di far partire una richiesta che verrebbe rifiutata. */
  it('non manda un obiettivo troppo corto', async () => {
    renderModal()

    await userEvent.type(screen.getByLabelText(/obiettivo formativo/i), 'un corso')

    expect(screen.getByRole('button', { name: /Proponi/ })).toBeDisabled()
    expect(servizio.draftPath).not.toHaveBeenCalled()
  })

  /* Quello che torna è una proposta da rileggere, e si rilegge nel form: la
   * finestra consegna e si chiude, come il gemello della scheda persona. */
  it('consegna la proposta al form e si chiude', async () => {
    renderModal('org-7')

    await userEvent.type(screen.getByLabelText(/obiettivo formativo/i), OBIETTIVO)
    await userEvent.click(screen.getByRole('button', { name: /Proponi/ }))

    await waitFor(() => expect(servizio.draftPath).toHaveBeenCalledWith(OBIETTIVO, 'org-7'))
    expect(onDrafted).toHaveBeenCalledWith(proposta)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  /* Le tappe sono una fila ordinata: una proposta le sostituisce tutte, e va
   * detto prima di far premere, non dopo. */
  it('avverte che le tappe già inserite vengono sostituite', () => {
    renderModal()

    expect(screen.getByText(/vengono sostituite dalla proposta/)).toBeInTheDocument()
  })

  it("mostra l'errore del server e resta aperta", async () => {
    servizio.draftPath.mockRejectedValue(new Error('Il catalogo è vuoto.'))
    renderModal()

    await userEvent.type(screen.getByLabelText(/obiettivo formativo/i), OBIETTIVO)
    await userEvent.click(screen.getByRole('button', { name: /Proponi/ }))

    expect(await screen.findByText('Il catalogo è vuoto.')).toBeInTheDocument()
    expect(onDrafted).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  /* Senza tenant scelto non c'è nessun catalogo da cui comporre. */
  it('resta spenta finché non è stata scelta un organizzazione', async () => {
    renderModal('')

    await userEvent.type(screen.getByLabelText(/obiettivo formativo/i), OBIETTIVO)

    expect(screen.getByRole('button', { name: /Proponi/ })).toBeDisabled()
  })
})
