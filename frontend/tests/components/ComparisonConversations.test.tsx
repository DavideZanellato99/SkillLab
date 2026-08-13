import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

/* La trascrizione ha già la sua schermata e i suoi test: qui interessa che
   il confronto la apra sulla conversazione giusta, e da dove la legge. */
const aperta = vi.hoisted(() => ({ row: null as Record<string, unknown> | null, scope: '' }))
vi.mock('../../src/components/ConversationDetailModal', () => ({
  default: ({ row, scope }: { row: Record<string, unknown>; scope: string }) => {
    aperta.row = row
    aperta.scope = scope
    return <div>trascrizione: {String(row.conversation_id)}</div>
  },
}))

import ComparisonConversations from '../../src/components/ComparisonConversations'
import type { ComparisonSubject } from '../../src/components/ComparisonConversations'
import type { Attempt } from '../../src/services/comparison'

/* I filtri della metà parlata, cioè la cosa che nessun altro può controllare
 * al posto di questo componente: quali prove restano affiancabili, quale
 * coppia viene proposta fra quelle rimaste, e cosa si legge quando i filtri
 * non ne lasciano abbastanza.
 *
 * Due chiamate con Anna e una chat con Bruno: aperto, il confronto proposto è
 * la prima contro l'ultima, che è proprio il paio che non si legge, e lo dice
 * per due ragioni insieme. È il motivo per cui i filtri esistono. */

function attempt(over: Partial<Attempt> & { conversation_id: string }): Attempt {
  return {
    title: 'Reclamo sul rimborso',
    mode: 'voice',
    avatar_id: 'anna',
    avatar_name: 'Anna Neri',
    conversation_at: '2026-02-01T10:00:00Z',
    evaluated_at: '2026-02-01T11:00:00Z',
    ai_score: 6,
    final_score: 6,
    has_override: false,
    summary: '',
    reviewer_name: null,
    review_note: null,
    review_reason: null,
    criteria: [],
    ...over,
  }
}

const attempts: Attempt[] = [
  attempt({ conversation_id: 'c1', title: 'Prima chiamata', final_score: 5 }),
  attempt({
    conversation_id: 'c2',
    title: 'Seconda chiamata',
    conversation_at: '2026-02-05T10:00:00Z',
    final_score: 8,
  }),
  attempt({
    conversation_id: 'c3',
    title: 'Chat con Bruno',
    mode: 'text',
    avatar_id: 'bruno',
    avatar_name: 'Bruno Verdi',
    conversation_at: '2026-02-09T10:00:00Z',
    final_score: 7,
  }),
]

const io: ComparisonSubject = {
  nome: 'Marco',
  cognome: 'Bianchi',
  email: 'marco@test.it',
  isSelf: true,
}

function renderConfronto(prove: Attempt[] = attempts, subject: ComparisonSubject = io) {
  render(<ComparisonConversations attempts={prove} subject={subject} />)
}

/* La coppia a confronto letta dalla fila: i due comandi accesi, come
   "titolo: posto". Le carte sono in ordine di tempo e ognuna porta prima il
   comando "prima" e poi quello "dopo". */
function scelte(): string[] {
  return screen.getAllByRole('button', { pressed: true }).map((comando) => {
    const label = comando.getAttribute('aria-label') ?? ''
    return `${label.split(',')[0]}: ${label.split('come ')[1]}`
  })
}

describe('ComparisonConversations', () => {
  it('avverte quando la coppia proposta mescola scenari e canali', () => {
    renderConfronto()

    expect(screen.getByText(/due scenari diversi/)).toBeInTheDocument()
    expect(screen.getByText(/due canali diversi/)).toBeInTheDocument()
  })

  it('restringendo il canale propone una coppia omogenea e non avverte più', async () => {
    const user = userEvent.setup()
    renderConfronto()

    await user.click(screen.getByRole('radio', { name: 'Chiamate' }))

    expect(screen.queryByText(/due canali diversi/)).not.toBeInTheDocument()
    expect(screen.queryByText(/due scenari diversi/)).not.toBeInTheDocument()
    expect(scelte()).toEqual(['Prima chiamata: prima', 'Seconda chiamata: dopo'])
  })

  /* Il posto lo dice chi sceglie, con il comando che tocca sulla prova: non
     c'è nessuna regola da indovinare su quale delle due lascia il posto. */
  it('mette la prova nel posto del comando toccato', async () => {
    const user = userEvent.setup()
    renderConfronto()

    await user.click(screen.getByRole('button', { name: /Seconda chiamata.*come prima/ }))

    expect(scelte()).toEqual(['Seconda chiamata: prima', 'Chat con Bruno: dopo'])
  })

  /* Con due prove sole, spostare quella che sta già nell'altro posto non può
     buttarne fuori nessuna: i due si scambiano. */
  it('scambia i due posti quando si sposta la prova che sta nell altro', async () => {
    const user = userEvent.setup()
    renderConfronto()

    await user.click(screen.getByRole('button', { name: /Chat con Bruno.*come prima/ }))

    expect(scelte()).toEqual(['Prima chiamata: dopo', 'Chat con Bruno: prima'])
  })

  it('dice in cima di quanto è cambiato il voto', () => {
    renderConfronto()

    /* Dal 5 della prima chiamata al 7 della chat con Bruno. */
    expect(screen.getByText('▲ +2')).toBeInTheDocument()
  })

  it('offre come scenari solo quelli raggiungibili dal canale scelto', async () => {
    const user = userEvent.setup()
    renderConfronto()

    await user.click(screen.getByRole('radio', { name: 'Chiamate' }))
    await user.click(screen.getByLabelText('Scenario'))

    const voci = screen.getAllByRole('option').map((o) => o.textContent)
    expect(voci).toEqual(['Tutti gli scenari', 'Anna Neri'])
  })

  /* Le due trascrizioni non stanno affiancate qui: si aprono nella schermata
     in cui una trascrizione si legge già, con le citazioni, l'audio e le note
     del docente. */
  it('apre la trascrizione della prova su cui si tocca il comando', async () => {
    const user = userEvent.setup()
    renderConfronto()

    await user.click(screen.getByRole('button', { name: /Apri la trascrizione di Prima chiamata/ }))

    expect(screen.getByText('trascrizione: c1')).toBeInTheDocument()
    expect(aperta.row).toMatchObject({ conversation_id: 'c1', avatar_name: 'Anna Neri' })
  })

  /* Le proprie conversazioni e quelle di un'altra persona arrivano da due
     endpoint diversi, ed è `scope` a dirlo alla schermata. */
  it('legge da amministratore la trascrizione di un altra persona', async () => {
    const user = userEvent.setup()
    renderConfronto(attempts, { ...io, isSelf: false })

    await user.click(screen.getByRole('button', { name: /Apri la trascrizione di Prima chiamata/ }))

    expect(aperta.scope).toBe('admin')
  })

  it('legge come propria la trascrizione di chi è collegato', async () => {
    const user = userEvent.setup()
    renderConfronto()

    await user.click(screen.getByRole('button', { name: /Apri la trascrizione di Prima chiamata/ }))

    expect(aperta.scope).toBe('own')
  })

  it('dice che sono i filtri a lasciare una prova sola, invece del vuoto', async () => {
    const user = userEvent.setup()
    renderConfronto()

    await user.click(screen.getByRole('radio', { name: 'Chat' }))

    expect(screen.getByText(/I filtri scelti lasciano una sola conversazione/)).toBeInTheDocument()
    /* La barra resta a schermo: il filtro da allargare è quello che ha appena
       svuotato la pagina, e deve restare a portata di mano. */
    expect(screen.getByRole('radio', { name: 'Chiamate' })).toBeInTheDocument()
  })
})
