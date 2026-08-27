import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import PaginationBar from '../../src/components/Pagination'
import { usePagination } from '../../src/hooks/usePagination'

/* La paginazione è la stessa per le tabelle e per le griglie di schede: quello
 * che vale qui vale in tutti e due i posti. */

function Elenco({ items, resetKey }: { items: string[]; resetKey?: unknown }) {
  const { visible, bar } = usePagination(items, resetKey)
  return (
    <>
      <ul>
        {visible.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <PaginationBar {...bar} />
    </>
  )
}

const voci = (n: number) => Array.from({ length: n }, (_, i) => `voce ${i + 1}`)

/* Si parte da venti righe per pagina: dieci lasciavano mezza scheda vuota su
 * uno schermo da scrivania, che è dove queste tabelle si guardano. Sessantotto
 * voci fanno quattro pagine piene meno una riga. */
describe('Pagination', () => {
  it('mostra solo la prima pagina e dice quanti sono in tutto', () => {
    render(<Elenco items={voci(68)} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(20)
    expect(screen.getByText('voce 20')).toBeInTheDocument()
    expect(screen.queryByText('voce 21')).not.toBeInTheDocument()
    expect(screen.getByText(/Da 1 a 20 di 68/)).toBeInTheDocument()
    expect(screen.getByText(/Pagina 1 di 4/)).toBeInTheDocument()
  })

  it('sfoglia avanti e indietro, e salta agli estremi', async () => {
    render(<Elenco items={voci(68)} />)

    await userEvent.click(screen.getByRole('button', { name: 'Pagina Successiva' }))
    expect(screen.getByText('voce 21')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Ultima Pagina' }))
    expect(screen.getByText(/Da 61 a 68 di 68/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Prima Pagina' }))
    expect(screen.getByText('voce 1')).toBeInTheDocument()
  })

  /* Agli estremi i bottoni si spengono invece di sparire: una barra che
   * cambia forma sfogliando sposta sotto il dito quello che si sta cliccando. */
  it('spegne i bottoni agli estremi', async () => {
    render(<Elenco items={voci(68)} />)

    expect(screen.getByRole('button', { name: 'Pagina Precedente' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Ultima Pagina' }))
    expect(screen.getByRole('button', { name: 'Pagina Successiva' })).toBeDisabled()
  })

  /* Cambiare il numero per pagina rimette la prima: la pagina quattro di
   * prima, con dieci elementi per pagina, è un punto diverso dell'elenco. */
  it('torna in cima quando cambia il numero per pagina', async () => {
    render(<Elenco items={voci(68)} />)

    await userEvent.click(screen.getByRole('button', { name: 'Ultima Pagina' }))
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: '10' }))

    expect(screen.getByText(/Da 1 a 10 di 68/)).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
  })

  /* Quando una ricerca riduce gli elementi, la pagina corrente può non
   * esistere più: l'elenco non deve restare vuoto. */
  it('rientra in un range valido quando gli elementi si riducono', async () => {
    const { rerender } = render(<Elenco items={voci(68)} />)

    await userEvent.click(screen.getByRole('button', { name: 'Ultima Pagina' }))
    rerender(<Elenco items={voci(24)} />)

    expect(screen.getByText(/Pagina 2 di 2/)).toBeInTheDocument()
    expect(screen.getByText('voce 21')).toBeInTheDocument()
  })

  /* Cambiare un filtro fa dell'elenco un altro elenco: restare alla terza
   * pagina di una domanda a cui si è smesso di rispondere non vuol dire
   * niente, e le righe che si vedrebbero non sono quelle che si cercava. */
  it("torna alla prima pagina quando l'elenco diventa un altro", async () => {
    const { rerender } = render(<Elenco items={voci(68)} resetKey="tutti" />)

    await userEvent.click(screen.getByRole('button', { name: 'Ultima Pagina' }))
    expect(screen.getByText(/Pagina 4 di 4/)).toBeInTheDocument()

    rerender(<Elenco items={voci(68)} resetKey="sospesi" />)
    expect(screen.getByText(/Pagina 1 di 4/)).toBeInTheDocument()
  })

  /* "Righe" è il default della tabella; un elenco di schede si fa chiamare
   * con il nome di quello che contiene. */
  it('chiama per nome quello che conta', () => {
    render(
      <PaginationBar
        page={1}
        totalPages={1}
        pageSize={10}
        total={3}
        rangeStart={1}
        rangeEnd={3}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
        label="Percorsi"
      />,
    )

    expect(screen.getByText('Percorsi per pagina')).toBeInTheDocument()
  })
})
