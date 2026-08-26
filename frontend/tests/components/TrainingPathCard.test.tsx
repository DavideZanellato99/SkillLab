import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { PathStep, TrainingPath } from '../../src/services/training'
import TrainingPathCard from '../../src/components/TrainingPathCard'

const step = (over: Partial<PathStep> & Pick<PathStep, 'id' | 'position'>): PathStep => ({
  kind: 'avatar',
  target_score: 7,
  criteria_targets: [],
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
  const azioni = {
    onShowAssigned: vi.fn(),
    onAssign: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }
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
    expect(screen.getByText(/Test Tecnico · obiettivo 7/)).toBeInTheDocument()
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
    expect(
      screen.queryByRole('button', { name: /Mostra chi sta percorrendo/ }),
    ).not.toBeInTheDocument()
  })

  /* Letto il numero di chi lo sta percorrendo, la domanda dopo è chi sono e a
   * che punto: il numero stesso ci porta, invece di lasciare l'altra linguetta
   * da aprire e filtrare a mano. */
  it('dal numero di chi lo sta percorrendo si passa a chi sono', async () => {
    const { onShowAssigned } = renderCard({ assigned_count: 3 })

    await userEvent.click(
      screen.getByRole('button', { name: 'Mostra chi sta percorrendo Onboarding' }),
    )

    expect(onShowAssigned).toHaveBeenCalled()
  })

  /* L'organizzazione si scrive solo a chi ne vede più di una: all'org admin
   * sarebbe la stessa parola ripetuta su ogni scheda. */
  it("scrive l'organizzazione solo a chi ne vede più di una", () => {
    const { unmount } = render(
      <TrainingPathCard
        path={percorso()}
        showOrganization
        onShowAssigned={vi.fn()}
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

  /* Oltre le prime tre la scheda diventerebbe alta il doppio di quella
   * accanto, e in una griglia sono le schede a doversi somigliare: le altre si
   * contano in coda. */
  describe('percorsi lunghi', () => {
    const lungo = () => ({
      steps: [1, 2, 3, 4, 5].map((position) => step({ id: `s-${position}`, position })),
    })

    it('mostra le prime tre tappe e conta le altre', () => {
      renderCard(lungo())

      expect(screen.getByText('Avatar 3')).toBeInTheDocument()
      expect(screen.queryByText('Avatar 4')).not.toBeInTheDocument()
      expect(screen.getByText('+2 tappe')).toBeInTheDocument()
    })

    it('usa il singolare per una tappa sola in coda', () => {
      renderCard({
        steps: [1, 2, 3, 4].map((position) => step({ id: `s-${position}`, position })),
      })

      expect(screen.getByText('+1 tappa')).toBeInTheDocument()
    })

    /* Contarle non basta: quali siano si legge senza aprire il percorso. */
    it('elenca nel tooltip le tappe che non entrano', async () => {
      renderCard(lungo())

      await userEvent.hover(screen.getByText('+2 tappe'))

      const tooltip = await screen.findByRole('tooltip')
      expect(tooltip).toHaveTextContent('4. Avatar 4')
      expect(tooltip).toHaveTextContent('5. Avatar 5')
    })
  })
})
