import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { PathStep, TrainingPath } from '../services/training'
import TrainingPathCard from './TrainingPathCard'

const step = (over: Partial<PathStep> & Pick<PathStep, 'id' | 'position'>): PathStep => ({
  kind: 'avatar',
  target_score: 7,
  due_at: null,
  avatar_id: `a${over.position}`,
  avatar_name: `Avatar ${over.position}`,
  avatar_category: 'Clienti',
  avatar_category_color: 'violet',
  simulation_id: null,
  simulation_title: null,
  simulation_kind: null,
  ...over,
})

const percorso = (over: Partial<TrainingPath> = {}): TrainingPath => ({
  id: 'p-1',
  organization_id: 'org-1',
  organization_name: 'Banca Esempio',
  title: 'Onboarding',
  description: null,
  steps: [step({ id: 's-1', position: 1 }), step({ id: 's-2', position: 2 })],
  assigned_count: 0,
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
  ...over,
})

function renderCard(over: Partial<TrainingPath> = {}, showOrganization = false) {
  const azioni = { onAssign: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() }
  render(<TrainingPathCard path={percorso(over)} showOrganization={showOrganization} {...azioni} />)
  return azioni
}

describe('TrainingPathCard', () => {
  /* Le tappe si vedono per intero e non dietro un "2 tappe" da aprire: sono
   * la cosa che distingue un percorso da un altro, e un titolo da solo non
   * dice se «Onboarding» finisce con una conversazione o con un test. */
  it('mostra le tappe in fila, numerate', () => {
    renderCard()

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('Avatar 1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Avatar 2')).toBeInTheDocument()
  })

  it('dice cosa chiede ogni tappa e con che obiettivo', () => {
    renderCard()

    expect(screen.getAllByText(/Conversazione · obiettivo 7/)).toHaveLength(2)
  })

  it('scrive la scadenza sulla tappa che ne ha una', () => {
    renderCard({
      steps: [step({ id: 's-1', position: 1, due_at: '2026-04-10T18:00:00' })],
    })

    // L'ora si legge nel fuso di chi guarda, quindi il test guarda il giorno
    expect(screen.getByText(/entro il 10 apr, \d{2}:\d{2}/)).toBeInTheDocument()
  })

  it('nomina anche le tappe fatte di un test tecnico', () => {
    renderCard({
      steps: [
        step({
          id: 's-1',
          position: 1,
          kind: 'simulation',
          avatar_id: null,
          avatar_name: null,
          simulation_id: 'sim-1',
          simulation_title: 'Normativa antiriciclaggio',
        }),
      ],
    })

    expect(screen.getByText('Normativa antiriciclaggio')).toBeInTheDocument()
    expect(screen.getByText(/Test tecnico · obiettivo 7/)).toBeInTheDocument()
  })

  it('dice quante persone lo stanno percorrendo', () => {
    renderCard({ assigned_count: 4 })

    expect(screen.getByText(/4 persone in percorso/)).toBeInTheDocument()
  })

  it('usa il singolare per una persona sola', () => {
    renderCard({ assigned_count: 1 })

    expect(screen.getByText(/1 persona in percorso/)).toBeInTheDocument()
  })

  /* "Non ancora assegnato" e non "0 persone": è la differenza fra un
   * percorso appena composto e uno che tutti hanno finito. */
  it('distingue un percorso mai assegnato', () => {
    renderCard()

    expect(screen.getByText(/non ancora assegnato/)).toBeInTheDocument()
  })

  /* L'organizzazione si scrive solo a chi ne vede più di una: all'org admin
   * sarebbe la stessa parola ripetuta su ogni scheda. */
  it("scrive l'organizzazione solo a chi ne vede più di una", () => {
    const { unmount } = render(
      <TrainingPathCard
        path={percorso()}
        showOrganization
        onAssign={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText(/Banca Esempio/)).toBeInTheDocument()
    unmount()

    renderCard()
    expect(screen.queryByText(/Banca Esempio/)).not.toBeInTheDocument()
  })

  it('offre le tre azioni in chiaro', async () => {
    const { onAssign, onEdit, onDelete } = renderCard()

    await userEvent.click(screen.getByRole('button', { name: 'Assegna Onboarding' }))
    await userEvent.click(screen.getByRole('button', { name: 'Modifica Onboarding' }))
    await userEvent.click(screen.getByRole('button', { name: 'Elimina Onboarding' }))

    expect(onAssign).toHaveBeenCalledOnce()
    expect(onEdit).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it("mostra la descrizione quando c'è", () => {
    renderCard({ description: 'Le basi del ruolo' })

    expect(screen.getByText('Le basi del ruolo')).toBeInTheDocument()
  })
})
