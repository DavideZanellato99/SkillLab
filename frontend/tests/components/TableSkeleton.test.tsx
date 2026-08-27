import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import TableSkeleton from '../../src/components/TableSkeleton'
import type { DataTableColumn } from '../../src/components/DataTable'

/* Lo scheletro esiste per togliere il salto: al posto di una rotella
 * centrata disegna l'ingombro che le righe avranno, quindi le colonne devono
 * stare alle stesse misure della tabella vera. */

const COLUMNS: DataTableColumn<never>[] = [
  { key: 'utente', label: 'Utente', width: '50%' },
  { key: 'ruolo', label: 'Ruolo', width: '30%' },
  { key: 'azioni', label: 'Azioni', width: '20%' },
]

describe('TableSkeleton', () => {
  it('tiene le misure che avrà la tabella vera', () => {
    const { container } = render(<TableSkeleton columns={COLUMNS} message="Caricamento..." />)

    const cols = container.querySelectorAll('colgroup col')
    expect([...cols].map((c) => (c as HTMLElement).style.width)).toEqual(['50%', '30%', '20%'])
    expect(container.querySelector('table')!.className).toContain('table-fixed')
  })

  /* Chi non lo vede deve sentire la stessa frase di prima, non una griglia di
   * caselle vuote: il contenitore fa da `status`, le celle finte sono
   * nascoste. */
  it('dice cosa si sta aspettando a chi legge con uno screen reader', () => {
    render(<TableSkeleton columns={COLUMNS} message="Caricamento utenti..." />)

    const stato = screen.getByRole('status')
    expect(stato).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Caricamento utenti...')).toBeInTheDocument()
  })

  it('non annuncia le celle finte come contenuto', () => {
    const { container } = render(<TableSkeleton columns={COLUMNS} message="Caricamento..." />)

    expect(container.querySelector('tbody')).toHaveAttribute('aria-hidden', 'true')
    // Le intestazioni si vedono ma non si annunciano: quello che conta è la frase
    expect(container.querySelectorAll('th[aria-hidden="true"]')).toHaveLength(3)
  })
})
