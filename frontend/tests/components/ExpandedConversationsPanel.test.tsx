import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ChatConversationSummary } from '../../src/services/api'
import ExpandedConversationsPanel from '../../src/components/ExpandedConversationsPanel'

/* Lo stesso elenco della colonna di sinistra, ma con lo spazio per dire di
 * ciascuna com'è andata: il canale, se è ancora aperta, l'anteprima e
 * quanti messaggi. È qui che si cerca, perché è qui che c'è da leggere. */

const conversazione = (over: Partial<ChatConversationSummary> = {}): ChatConversationSummary => ({
  id: 'c-1',
  avatar_id: 'a-1',
  title: 'Clienti 1',
  mode: 'text',
  ended_at: null,
  created_at: '2026-03-01T10:00:00Z',
  updated_at: '2026-03-01T10:00:00Z',
  message_count: 4,
  last_message_preview: 'Buongiorno, come posso aiutarla?',
  ...over,
})

function renderPanel(over: Partial<Parameters<typeof ExpandedConversationsPanel>[0]> = {}) {
  const azioni = {
    onSearchChange: vi.fn(),
    onRenameValueChange: vi.fn(),
    onStartRename: vi.fn(),
    onCommitRename: vi.fn(),
    onCancelRename: vi.fn(),
    onOpen: vi.fn(),
    onDelete: vi.fn(),
    onNewConversation: vi.fn(),
    onClose: vi.fn(),
  }
  const conversations = over.conversations ?? [conversazione()]
  render(
    <ExpandedConversationsPanel
      avatarImageUrl="/static/avatars/a-1.png"
      avatarName="Cliente arrabbiato"
      conversations={conversations}
      visibleConversations={over.visibleConversations ?? conversations}
      search=""
      currentConversationId={null}
      canDelete={false}
      renamingId={null}
      renameValue=""
      {...azioni}
      {...over}
    />,
  )
  return azioni
}

describe('intestazione', () => {
  it("conta le conversazioni avute con quell'avatar", () => {
    renderPanel({ conversations: [conversazione(), conversazione({ id: 'c-2' })] })

    expect(screen.getByText('2 conversazioni con Cliente arrabbiato')).toBeInTheDocument()
  })

  it('usa il singolare per una conversazione sola', () => {
    renderPanel()

    expect(screen.getByText('1 conversazione con Cliente arrabbiato')).toBeInTheDocument()
  })

  it('si chiude', async () => {
    const { onClose } = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('le righe', () => {
  it("dicono com'è andata ciascuna", () => {
    renderPanel()

    expect(screen.getByText('Clienti 1')).toBeInTheDocument()
    expect(screen.getByText('Buongiorno, come posso aiutarla?')).toBeInTheDocument()
    expect(screen.getByText('4 messaggi')).toBeInTheDocument()
  })

  /* Aperta o terminata è la differenza fra una conversazione che si può
   * riprendere e una trascrizione da rileggere: sta scritta sulla riga
   * perché è quello che si decide guardando l'elenco. */
  it('distinguono una conversazione aperta da una chiusa', () => {
    renderPanel({
      conversations: [
        conversazione(),
        conversazione({ id: 'c-2', ended_at: '2026-03-01T11:00:00Z' }),
      ],
    })

    expect(screen.getByText('Aperta')).toBeInTheDocument()
    expect(screen.getByText('Terminata')).toBeInTheDocument()
  })

  it('aprono la conversazione scelta', async () => {
    const { onOpen } = renderPanel()

    await userEvent.click(screen.getByText('Clienti 1'))

    expect(onOpen).toHaveBeenCalledWith('c-1')
  })

  it('non lasciano una riga vuota per una conversazione senza anteprima', () => {
    renderPanel({ conversations: [conversazione({ last_message_preview: null })] })

    expect(screen.queryByText('Buongiorno, come posso aiutarla?')).not.toBeInTheDocument()
  })

  it('mostrano il cestino solo a chi può eliminare', async () => {
    const { onDelete } = renderPanel({ canDelete: true })

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Conversazione' }))

    expect(onDelete).toHaveBeenCalledWith('c-1', expect.anything())
  })

  it("senza il permesso il cestino non c'è", () => {
    renderPanel()

    expect(screen.queryByRole('button', { name: 'Elimina Conversazione' })).not.toBeInTheDocument()
  })
})

describe('ricerca', () => {
  it('riporta quello che si sta scrivendo', async () => {
    const { onSearchChange } = renderPanel()

    await userEvent.type(screen.getByPlaceholderText(/Cerca per nome/), 'reclamo')

    expect(onSearchChange).toHaveBeenCalled()
  })

  /* Senza nessuna conversazione non c'è niente da cercare: il campo
   * sparisce invece di restare lì a non filtrare niente. */
  it("non offre la ricerca quando non c'è nessuna conversazione", () => {
    renderPanel({ conversations: [], visibleConversations: [] })

    expect(screen.queryByPlaceholderText(/Cerca per nome/)).not.toBeInTheDocument()
    expect(screen.getByText('Nessuna conversazione presente')).toBeInTheDocument()
  })

  /* Una ricerca senza esiti e un elenco vuoto sono due cose diverse: la
   * prima si risolve cambiando le parole, la seconda parlando con l'avatar. */
  it('distingue una ricerca senza esiti da un elenco vuoto', () => {
    renderPanel({ visibleConversations: [], search: 'reclamo' })

    expect(screen.getByText('Nessuna conversazione corrisponde alla ricerca')).toBeInTheDocument()
  })
})

describe('rinomina', () => {
  it('comincia dalla riga giusta', async () => {
    const { onStartRename } = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Rinomina Conversazione' }))

    expect(onStartRename).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c-1' }),
      expect.anything(),
    )
  })

  it('mostra il campo sulla riga che si sta rinominando', () => {
    renderPanel({ renamingId: 'c-1', renameValue: 'Reclamo difficile' })

    expect(screen.getByPlaceholderText('Nome della conversazione')).toHaveValue('Reclamo difficile')
  })

  /* Mentre si scrive il nome, cliccare nel campo non deve aprire la
   * conversazione sotto. */
  it('non apre la conversazione mentre la si rinomina', async () => {
    const { onOpen } = renderPanel({ renamingId: 'c-1', renameValue: 'Reclamo' })

    await userEvent.click(screen.getByPlaceholderText('Nome della conversazione'))

    expect(onOpen).not.toHaveBeenCalled()
  })

  it('salva con Invio e annulla con Esc', async () => {
    const { onCommitRename, onCancelRename } = renderPanel({
      renamingId: 'c-1',
      renameValue: 'Reclamo',
    })

    const campo = screen.getByPlaceholderText('Nome della conversazione')
    await userEvent.type(campo, '{Enter}')
    expect(onCommitRename).toHaveBeenCalledWith(expect.objectContaining({ id: 'c-1' }))

    await userEvent.type(campo, '{Escape}')
    expect(onCancelRename).toHaveBeenCalledOnce()
  })

  it('nasconde le azioni della riga durante la rinomina', () => {
    renderPanel({ renamingId: 'c-1', renameValue: 'Reclamo', canDelete: true })

    expect(screen.queryByRole('button', { name: 'Rinomina Conversazione' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Elimina Conversazione' })).not.toBeInTheDocument()
  })
})
