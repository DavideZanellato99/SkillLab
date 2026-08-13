import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

/* Il tentativo per intero ha già la sua schermata e i suoi test: qui
   interessa che il confronto apra quello giusto, e come. */
const aperto = vi.hoisted(() => ({ attemptId: '', own: false }))
vi.mock('../../src/components/SimulationAttemptModal', () => ({
  default: ({ attemptId, own }: { attemptId: string; own: boolean }) => {
    aperto.attemptId = attemptId
    aperto.own = own
    return <div>tentativo: {attemptId}</div>
  },
}))

import ComparisonSimulations from '../../src/components/ComparisonSimulations'
import type {
  SimulationAnswerOutcome,
  SimulationComparisonAttempt,
} from '../../src/services/comparison'

/* Quello che la metà scritta sa dire e l'altra no: quali domande sono state
 * recuperate e quali perse rifacendo lo stesso test.
 *
 * Le domande capitate in tutte e due le prove si appaiano per id, e quelle il
 * cui esito è cambiato salgono in cima: sono la ragione per cui un test si
 * rifà, e nell'ordine del primo tentativo finirebbero sparse fra quelle che
 * ripetono un esito già noto. */

function answer(over: Partial<SimulationAnswerOutcome> & { question_id: string }) {
  return {
    position: 1,
    text: `Testo di ${over.question_id}`,
    is_correct: true,
    selected_option: 0,
    correct_option: 0,
    ...over,
  }
}

function attempt(
  over: Partial<SimulationComparisonAttempt> & { attempt_id: string },
): SimulationComparisonAttempt {
  return {
    simulation_id: 's-1',
    simulation_title: 'Sicurezza in cantiere',
    simulation_kind: 'multiple',
    simulation_source: 'manual',
    attempted_at: '2026-02-01T10:00:00Z',
    correct_count: 2,
    question_count: 3,
    score: 5,
    answers: [],
    ...over,
  }
}

/* Fra la prima prova e la seconda: q1 resta giusta, q2 è stata recuperata, q3
 * è stata persa. */
const stessoTest: SimulationComparisonAttempt[] = [
  attempt({
    attempt_id: 't1',
    score: 5,
    answers: [
      answer({ question_id: 'q1', text: 'Domanda uno', is_correct: true }),
      answer({ question_id: 'q2', text: 'Domanda due', is_correct: false }),
      answer({ question_id: 'q3', text: 'Domanda tre', is_correct: true }),
    ],
  }),
  attempt({
    attempt_id: 't2',
    attempted_at: '2026-02-05T10:00:00Z',
    score: 7,
    answers: [
      answer({ question_id: 'q1', text: 'Domanda uno', is_correct: true }),
      answer({ question_id: 'q2', text: 'Domanda due', is_correct: true }),
      answer({ question_id: 'q3', text: 'Domanda tre', is_correct: false }),
    ],
  }),
]

function renderConfronto(prove: SimulationComparisonAttempt[] = stessoTest, isOwn = true) {
  render(<ComparisonSimulations attempts={prove} isOwn={isOwn} />)
}

describe('ComparisonSimulations', () => {
  it('dice in cima di quanto è cambiato il voto e cosa è cambiato sotto', () => {
    renderConfronto()

    expect(screen.getByText('▲ +2')).toBeInTheDocument()
    expect(
      screen.getByText('1 domanda recuperata, 1 domanda persa, su 3 in comune'),
    ).toBeInTheDocument()
  })

  it('mette in cima le domande il cui esito è cambiato', () => {
    renderConfronto()

    const domande = screen.getAllByText(/^Domanda (uno|due|tre)$/).map((el) => el.textContent)
    expect(domande).toEqual(['Domanda due', 'Domanda tre', 'Domanda uno'])
  })

  it('fra due test diversi avverte e non appaia nessuna domanda', () => {
    render(
      <ComparisonSimulations
        isOwn
        attempts={[
          stessoTest[0],
          attempt({
            attempt_id: 't3',
            simulation_id: 's-2',
            simulation_title: 'Primo soccorso',
            attempted_at: '2026-02-08T10:00:00Z',
            answers: [answer({ question_id: 'q1', text: 'Domanda uno' })],
          }),
        ]}
      />,
    )

    expect(screen.getByText(/due test diversi/)).toBeInTheDocument()
    expect(screen.queryByText('Domanda per domanda')).not.toBeInTheDocument()
  })

  it('dice che sono i filtri a lasciare un test solo, invece del vuoto', () => {
    renderConfronto([stessoTest[0]])

    expect(screen.getByText(/È stato consegnato un solo test/)).toBeInTheDocument()
  })

  /* Il dettaglio domanda per domanda dice solo com'è andata una domanda:
     cosa fosse stato risposto sta nel tentativo per intero. */
  it('apre il tentativo su cui si tocca il comando', async () => {
    const user = userEvent.setup()
    renderConfronto()

    await user.click(
      screen.getByRole('button', {
        name: /Apri il tentativo su Sicurezza in cantiere del 05 feb 2026/,
      }),
    )

    expect(screen.getByText('tentativo: t2')).toBeInTheDocument()
  })

  /* Un tentativo aperto da chi l'ha svolto non porta il nome di nessun altro,
     e non si butta via: l'endpoint invece è lo stesso per tutti e due. */
  it('dice alla schermata del tentativo chi lo sta leggendo', async () => {
    const user = userEvent.setup()
    renderConfronto(stessoTest, false)

    await user.click(screen.getAllByRole('button', { name: /Apri il tentativo/ })[0])

    expect(aperto.own).toBe(false)
  })
})
