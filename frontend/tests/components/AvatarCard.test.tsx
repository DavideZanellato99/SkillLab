import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import type { Avatar } from '../../src/services/api'
import AvatarCard from '../../src/components/AvatarCard'

const base: Avatar = {
  id: 'a-1',
  name: 'Cliente arrabbiato',
  image_url: '/static/avatars/a-1.png',
  category: 'Clienti',
  category_id: 'cat-1',
  category_color: 'violet',
  description: 'Chiama per un addebito che non riconosce',
  created_at: '2026-01-01T10:00:00Z',
  own_sessions: 0,
  last_session_at: null,
}

function renderCard(over: Partial<Avatar> = {}) {
  render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/app" element={<AvatarCard avatar={{ ...base, ...over }} index={0} />} />
        <Route path="/app/chat/:avatarId" element={<p>Chat aperta</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const scheda = () => screen.getByRole('link', { name: /Parla con Cliente arrabbiato/ })

describe('AvatarCard', () => {
  it("presenta l'avatar con la sua targhetta", () => {
    renderCard()

    expect(screen.getByRole('heading', { name: 'Cliente arrabbiato' })).toBeInTheDocument()
    expect(screen.getByText('Chiama per un addebito che non riconosce')).toBeInTheDocument()
    expect(screen.getByText('Clienti')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Cliente arrabbiato' })).toHaveAttribute(
      'src',
      '/static/avatars/a-1.png',
    )
  })

  it("apre la chat con quell'avatar", async () => {
    renderCard()

    await userEvent.click(scheda())

    expect(screen.getByText('Chat aperta')).toBeInTheDocument()
  })

  /* È un link vero e non un riquadro reso cliccabile: la tastiera lo
   * raggiunge da sola, e con lui tornano il tasto centrale, «apri in una
   * scheda nuova» e l'indirizzo da trascinare o copiare. */
  it('è un link con il proprio indirizzo, non un riquadro cliccabile', () => {
    renderCard()

    expect(scheda()).toHaveAttribute('href', '/app/chat/a-1')
  })

  it('si apre da tastiera', async () => {
    renderCard()

    scheda().focus()
    await userEvent.keyboard('{Enter}')

    expect(screen.getByText('Chat aperta')).toBeInTheDocument()
  })
})

/* Quello che chi guarda ci ha già fatto: è l'informazione che si cerca
 * scorrendo il catalogo, cioè da dove ricominciare e cosa non si è ancora
 * provato. */
describe('lo storico personale', () => {
  it('dice quante sessioni e quando è stata l’ultima', () => {
    renderCard({ own_sessions: 4, last_session_at: '2026-03-05T09:00:00Z' })

    expect(screen.getByText(/4 sessioni/)).toBeInTheDocument()
    expect(screen.getByText(/05 mar 2026/)).toBeInTheDocument()
  })

  it('al singolare non dice "1 sessioni"', () => {
    renderCard({ own_sessions: 1, last_session_at: '2026-03-05T09:00:00Z' })

    expect(screen.getByText(/^1 sessione,/)).toBeInTheDocument()
  })

  /* Una tessera mai affrontata non ha niente da raccontare: uno zero sarebbe
   * rumore su ogni avatar nuovo del catalogo. */
  it('su un avatar mai affrontato non mostra nessuno zero', () => {
    renderCard()

    expect(screen.queryByText(/session/)).not.toBeInTheDocument()
  })

  /* L'invito cambia di conseguenza: la prima volta si comincia, dopo si
   * rifà lo stesso scenario. */
  it('invita a riprovare chi ci ha già parlato', () => {
    renderCard()
    expect(screen.getByText('Parla')).toBeInTheDocument()

    renderCard({ own_sessions: 2 })
    expect(screen.getByText('Riprova')).toBeInTheDocument()
  })
})

/* Un ritratto che non arriva lasciava il testo alternativo su fondo scuro,
 * che sembra una tessera rotta. */
describe('quando il ritratto non arriva', () => {
  it('mette una sagoma al posto della foto', () => {
    renderCard()

    fireEvent.error(screen.getByRole('img', { name: 'Cliente arrabbiato' }))

    expect(screen.queryByRole('img', { name: 'Cliente arrabbiato' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cliente arrabbiato' })).toBeInTheDocument()
  })
})
