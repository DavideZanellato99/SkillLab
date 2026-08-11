import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import type { Avatar } from '../../src/services/api'
import AvatarCard from '../../src/components/AvatarCard'

const avatar: Avatar = {
  id: 'a-1',
  name: 'Cliente arrabbiato',
  image_url: '/static/avatars/a-1.png',
  category: 'Clienti',
  category_id: 'cat-1',
  category_color: 'violet',
  description: 'Chiama per un addebito che non riconosce',
  created_at: '2026-01-01T10:00:00Z',
  selection_count: 3,
  difficulty: '8/10',
}

function renderCard() {
  render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/app" element={<AvatarCard avatar={avatar} index={0} />} />
        <Route path="/app/chat/:avatarId" element={<p>Chat aperta</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const scheda = () => screen.getByRole('button', { name: 'Parla con Cliente arrabbiato' })

describe('AvatarCard', () => {
  it("presenta l'avatar con le sue targhette", () => {
    renderCard()

    expect(screen.getByRole('heading', { name: 'Cliente arrabbiato' })).toBeInTheDocument()
    expect(screen.getByText('Chiama per un addebito che non riconosce')).toBeInTheDocument()
    expect(screen.getByText('Clienti')).toBeInTheDocument()
    expect(screen.getByText(/Difficoltà: 8\/10/)).toBeInTheDocument()
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

  /* La scheda è un div reso cliccabile, quindi la tastiera non la
   * raggiungerebbe da sola: senza il ruolo, il focus e i due tasti, la
   * galleria si potrebbe usare solo con il mouse. */
  it('si apre anche da tastiera', async () => {
    renderCard()

    scheda().focus()
    await userEvent.keyboard('{Enter}')

    expect(screen.getByText('Chat aperta')).toBeInTheDocument()
  })

  it('si apre anche con la barra spaziatrice', async () => {
    renderCard()

    scheda().focus()
    await userEvent.keyboard(' ')

    expect(screen.getByText('Chat aperta')).toBeInTheDocument()
  })
})
