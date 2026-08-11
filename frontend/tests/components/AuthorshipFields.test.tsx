import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import AuthorshipFields from '../../src/components/AuthorshipFields'

/* Le tre schede di amministrazione mostrano la paternità con questo
 * componente, quindi è qui che si controlla una volta sola come vengono
 * lette le due etichette che il server manda al posto di un indirizzo. */

const CREATED = '2026-07-20T09:30:00Z'
const UPDATED = '2026-07-28T14:05:00Z'

describe('AuthorshipFields', () => {
  it("mostra chi ha creato la riga e chi l'ha modificata", () => {
    render(
      <AuthorshipFields
        row={{
          created_at: CREATED,
          created_by_email: 'capo@example.com',
          updated_at: UPDATED,
          updated_by_email: 'vice@example.com',
        }}
      />,
    )

    expect(screen.getByText('da capo@example.com')).toBeInTheDocument()
    expect(screen.getByText('da vice@example.com')).toBeInTheDocument()
  })

  it('dice "Mai modificato" quando le due date coincidono', () => {
    render(
      <AuthorshipFields
        row={{
          created_at: CREATED,
          created_by_email: 'capo@example.com',
          updated_at: CREATED,
          updated_by_email: 'capo@example.com',
        }}
      />,
    )

    expect(screen.getByText('Mai modificato')).toBeInTheDocument()
    expect(screen.queryByText('da vice@example.com')).not.toBeInTheDocument()
  })

  it('legge le etichette del server come frasi, non come indirizzi', () => {
    render(
      <AuthorshipFields
        row={{
          created_at: CREATED,
          created_by_email: 'sistema',
          updated_at: UPDATED,
          updated_by_email: 'utente eliminato',
        }}
      />,
    )

    expect(screen.getByText('dal sistema')).toBeInTheDocument()
    expect(screen.getByText('da un utente eliminato')).toBeInTheDocument()
  })
})
