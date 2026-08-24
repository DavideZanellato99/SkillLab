import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import type { Avatar, ChatConversationSummary } from '../../src/services/api'
import ChatSidebar from '../../src/components/ChatSidebar'

const avatar = {
  id: 'a-1',
  name: 'Cliente arrabbiato',
  image_url: '/static/avatars/a-1.png',
  category: 'Clienti',
  category_color: 'violet',
  description: 'Chiama per un addebito',
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

/** Un elenco lungo abbastanza da far comparire la casella di ricerca. */
const molteConversazioni = (quante = 6) =>
  Array.from({ length: quante }, (_, i) =>
    conversazione({ id: `c-${i + 1}`, title: `Clienti ${i + 1}` }),
  )

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
    onSearchChange: vi.fn(),
  }
  /* Le righe mostrate sono quelle rimaste dopo la ricerca: chi non la prova
   * passa la stessa lista due volte, che è il caso senza filtro. */
  const conversations = over.conversations ?? [conversazione()]
  render(
    <MemoryRouter>
      <ChatSidebar
        avatar={avatar}
        currentConversationId={null}
        isOpen
        canDelete={false}
        renamingId={null}
        renameValue=""
        search=""
        {...azioni}
        {...over}
        conversations={conversations}
        visibleConversations={over.visibleConversations ?? conversations}
      />
    </MemoryRouter>,
  )
  return azioni
}

describe('ChatSidebar', () => {
  it("presenta l'avatar con la sua targhetta", () => {
    renderSidebar()

    expect(screen.getByRole('heading', { name: 'Cliente arrabbiato' })).toBeInTheDocument()
    expect(screen.getByText('Clienti')).toBeInTheDocument()
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

    await userEvent.click(screen.getByRole('button', { name: /Nuova Conversazione/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Espandi le Conversazioni' }))

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
          visibleConversations={[conversazione()]}
          search=""
          onSearchChange={vi.fn()}
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
    expect(screen.getByRole('button', { name: 'Elimina Conversazione' })).toBeInTheDocument()
    unmount()

    renderSidebar()
    expect(screen.queryByRole('button', { name: 'Elimina Conversazione' })).not.toBeInTheDocument()
  })

  it('torna alla galleria', () => {
    renderSidebar()

    expect(screen.getByRole('link', { name: /Torna alla Galleria/ })).toHaveAttribute(
      'href',
      '/app',
    )
  })
})

/* La colonna è stretta e la ricerca ci sta solo quando serve davvero: è
 * l'unica parte di questo componente che decide qualcosa da sé. */
describe('ricerca fra le conversazioni', () => {
  const casella = () => screen.queryByRole('textbox', { name: 'Cerca fra le conversazioni' })

  it('non compare finché le conversazioni sono poche', () => {
    renderSidebar({ conversations: molteConversazioni(5) })

    expect(casella()).not.toBeInTheDocument()
  })

  it('compare quando la lista si allunga', () => {
    renderSidebar({ conversations: molteConversazioni(6) })

    expect(casella()).toBeInTheDocument()
  })

  /* Se sparisse col restringersi dell'elenco, la ricerca resterebbe scritta
   * e non ci sarebbe più il campo da cui cancellarla. */
  it('resta a vista con una ricerca scritta, anche su pochi risultati', () => {
    renderSidebar({
      conversations: molteConversazioni(3),
      visibleConversations: [conversazione({ title: 'Clienti 2' })],
      search: 'clienti 2',
    })

    expect(casella()).toHaveValue('clienti 2')
  })

  it('elenca solo le conversazioni rimaste', () => {
    renderSidebar({
      conversations: molteConversazioni(6),
      visibleConversations: [conversazione({ id: 'c-2', title: 'Clienti 2' })],
      search: 'clienti 2',
    })

    expect(screen.getByText('Clienti 2')).toBeInTheDocument()
    expect(screen.queryByText('Clienti 1')).not.toBeInTheDocument()
  })

  it('riporta quello che si scrive a chi tiene il filtro', async () => {
    const { onSearchChange } = renderSidebar({ conversations: molteConversazioni(6) })

    await userEvent.type(screen.getByRole('textbox', { name: 'Cerca fra le conversazioni' }), 'r')

    expect(onSearchChange).toHaveBeenCalledWith('r')
  })

  /* Una lista vuota per la ricerca e una lista vuota perché non si è ancora
   * parlato con nessuno sono due notizie diverse. */
  it('distingue il vuoto della ricerca da quello di partenza', () => {
    renderSidebar({
      conversations: molteConversazioni(6),
      visibleConversations: [],
      search: 'inesistente',
    })
    expect(screen.getByText('Nessuna conversazione corrisponde alla ricerca')).toBeInTheDocument()
    cleanup()

    renderSidebar({ conversations: [], visibleConversations: [] })
    expect(screen.getByText('Nessuna conversazione presente')).toBeInTheDocument()
  })
})

describe('rinomina di una conversazione', () => {
  it('chiede di cominciare dalla riga giusta', async () => {
    const { onStartRename } = renderSidebar()

    await userEvent.click(screen.getByRole('button', { name: 'Rinomina Conversazione' }))

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

    expect(screen.queryByRole('button', { name: 'Rinomina Conversazione' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Elimina Conversazione' })).not.toBeInTheDocument()
  })
})
