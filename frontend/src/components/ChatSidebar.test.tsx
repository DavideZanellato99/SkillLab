import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import type { Avatar, ChatConversationSummary } from '../services/api'
import ChatSidebar from './ChatSidebar'

const avatar = {
  id: 'a-1',
  name: 'Cliente arrabbiato',
  image_url: '/static/avatars/a-1.png',
  category: 'Clienti',
  category_color: 'violet',
  description: 'Chiama per un addebito',
  difficulty: '8/10',
} as Avatar

const conversazione = (over: Partial<ChatConversationSummary> = {}): ChatConversationSummary => ({
  id: 'c-1',
  avatar_id: 'a-1',
  title: 'Clienti 1',
  mode: 'text',
  ended_at: null,
  created_at: '2026-03-01T10:00:00Z',
  updated_at: '2026-03-01T10:00:00Z',
  message_count: 4,
  last_message_preview: 'Buongiorno',
  ...over,
})

function renderSidebar(over: Partial<Parameters<typeof ChatSidebar>[0]> = {}) {
  const azioni = {
    onRenameValueChange: vi.fn(),
    onStartRename: vi.fn(),
    onCommitRename: vi.fn(),
    onCancelRename: vi.fn(),
    onSelect: vi.fn(),
    onDelete: vi.fn(),
    onNewConversation: vi.fn(),
    onExpand: vi.fn(),
  }
  render(
    <MemoryRouter>
      <ChatSidebar
        avatar={avatar}
        conversations={[conversazione()]}
        currentConversationId={null}
        isOpen
        canDelete={false}
        renamingId={null}
        renameValue=""
        {...azioni}
        {...over}
      />
    </MemoryRouter>,
  )
  return azioni
}

describe('ChatSidebar', () => {
  it("presenta l'avatar con le sue targhette", () => {
    renderSidebar()

    expect(screen.getByRole('heading', { name: 'Cliente arrabbiato' })).toBeInTheDocument()
    expect(screen.getByText('Clienti')).toBeInTheDocument()
    expect(screen.getByText(/Difficoltà: 8\/10/)).toBeInTheDocument()
  })

  it('elenca le conversazioni con data e numero di messaggi', () => {
    renderSidebar()

    expect(screen.getByText('Clienti 1')).toBeInTheDocument()
    expect(screen.getByText(/4 msg/)).toBeInTheDocument()
  })

  it("dice quando non ce n'è ancora nessuna", () => {
    renderSidebar({ conversations: [] })

    expect(screen.getByText('Nessuna conversazione presente')).toBeInTheDocument()
  })

  it('apre la conversazione scelta', async () => {
    const { onSelect } = renderSidebar()

    await userEvent.click(screen.getByText('Clienti 1'))

    expect(onSelect).toHaveBeenCalledWith('c-1')
  })

  it("apre una conversazione nuova ed espande l'elenco", async () => {
    const { onNewConversation, onExpand } = renderSidebar()

    await userEvent.click(screen.getByRole('button', { name: /Nuova conversazione/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Espandi le conversazioni' }))

    expect(onNewConversation).toHaveBeenCalledOnce()
    expect(onExpand).toHaveBeenCalledOnce()
  })

  /* Eliminare una conversazione è un'azione da amministratore: a chi non
   * può, il cestino non compare invece di comparire e fallire. */
  it('mostra il cestino solo a chi può eliminare', () => {
    const { unmount } = render(
      <MemoryRouter>
        <ChatSidebar
          avatar={avatar}
          conversations={[conversazione()]}
          currentConversationId={null}
          isOpen
          canDelete
          renamingId={null}
          renameValue=""
          onRenameValueChange={vi.fn()}
          onStartRename={vi.fn()}
          onCommitRename={vi.fn()}
          onCancelRename={vi.fn()}
          onSelect={vi.fn()}
          onDelete={vi.fn()}
          onNewConversation={vi.fn()}
          onExpand={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Elimina conversazione' })).toBeInTheDocument()
    unmount()

    renderSidebar()
    expect(screen.queryByRole('button', { name: 'Elimina conversazione' })).not.toBeInTheDocument()
  })

  it('torna alla galleria', () => {
    renderSidebar()

    expect(screen.getByRole('link', { name: /Torna alla Gallery/ })).toHaveAttribute('href', '/app')
  })
})

describe('rinomina di una conversazione', () => {
  it('chiede di cominciare dalla riga giusta', async () => {
    const { onStartRename } = renderSidebar()

    await userEvent.click(screen.getByRole('button', { name: 'Rinomina conversazione' }))

    expect(onStartRename).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c-1' }),
      expect.anything(),
    )
  })

  it('mostra il campo sulla riga che si sta rinominando', () => {
    renderSidebar({ renamingId: 'c-1', renameValue: 'Reclamo difficile' })

    expect(screen.getByPlaceholderText('Nome della conversazione')).toHaveValue('Reclamo difficile')
  })

  /* Mentre si scrive, la riga non deve aprire la conversazione: cliccare nel
   * campo per correggere una lettera porterebbe via dalla rinomina. */
  it('non apre la conversazione mentre la si rinomina', async () => {
    const { onSelect } = renderSidebar({ renamingId: 'c-1', renameValue: 'Reclamo' })

    await userEvent.click(screen.getByPlaceholderText('Nome della conversazione'))

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('salva con Invio', async () => {
    const { onCommitRename } = renderSidebar({ renamingId: 'c-1', renameValue: 'Reclamo' })

    await userEvent.type(screen.getByPlaceholderText('Nome della conversazione'), '{Enter}')

    expect(onCommitRename).toHaveBeenCalledWith(expect.objectContaining({ id: 'c-1' }))
  })

  it('annulla con Esc', async () => {
    const { onCancelRename } = renderSidebar({ renamingId: 'c-1', renameValue: 'Reclamo' })

    await userEvent.type(screen.getByPlaceholderText('Nome della conversazione'), '{Escape}')

    expect(onCancelRename).toHaveBeenCalledOnce()
  })

  /* Mentre il campo è aperto le altre azioni della riga spariscono: sono
   * bersagli sotto le dita di chi sta scrivendo il nome. */
  it('nasconde le azioni della riga durante la rinomina', () => {
    renderSidebar({ renamingId: 'c-1', renameValue: 'Reclamo', canDelete: true })

    expect(screen.queryByRole('button', { name: 'Rinomina conversazione' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Elimina conversazione' })).not.toBeInTheDocument()
  })
})
