import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import TabBar, { TabPanel } from '../../src/components/TabBar'

/* Le linguette sono un gruppo di alternative e non una fila di pulsanti: da
 * tastiera si scorrono con le frecce, e dentro il gruppo Tab si ferma una
 * volta sola. */

type Prova = 'prima' | 'seconda' | 'terza'

function Schermata({ base }: { base?: string }) {
  const [value, setValue] = useState<Prova>('prima')
  return (
    <>
      <TabBar
        items={[
          { value: 'prima', label: 'Prima' },
          { value: 'seconda', label: 'Seconda' },
          { value: 'terza', label: 'Terza' },
        ]}
        value={value}
        onChange={setValue}
        ariaLabel="Cosa guardare"
        panelBase={base}
      />
      {base ? (
        <TabPanel base={base} value={value}>
          contenuto: {value}
        </TabPanel>
      ) : (
        <div>contenuto: {value}</div>
      )}
    </>
  )
}

const linguetta = (nome: string) => screen.getByRole('tab', { name: nome })

describe('scelta con il puntatore', () => {
  it('cambia il contenuto', async () => {
    render(<Schermata />)

    await userEvent.click(linguetta('Seconda'))

    expect(screen.getByText('contenuto: seconda')).toBeInTheDocument()
    expect(linguetta('Seconda')).toHaveAttribute('aria-selected', 'true')
    expect(linguetta('Prima')).toHaveAttribute('aria-selected', 'false')
  })
})

describe('scelta da tastiera', () => {
  /* Dentro il gruppo si ferma solo la linguetta accesa: Tab esce verso il
     contenuto invece di attraversare una per una anche le altre. */
  it('con Tab si entra una volta sola', async () => {
    render(<Schermata />)

    await userEvent.tab()

    expect(linguetta('Prima')).toHaveFocus()
    expect(linguetta('Seconda')).toHaveAttribute('tabindex', '-1')
  })

  it('le frecce scorrono le linguette e portano il fuoco', async () => {
    render(<Schermata />)
    await userEvent.tab()

    await userEvent.keyboard('{ArrowRight}')

    expect(linguetta('Seconda')).toHaveFocus()
    expect(screen.getByText('contenuto: seconda')).toBeInTheDocument()
  })

  /* Fermarsi in silenzio a fondo fila si legge come un tasto rotto. */
  it('dalla fine la destra torna in testa', async () => {
    render(<Schermata />)
    await userEvent.tab()

    await userEvent.keyboard('{ArrowLeft}')

    expect(linguetta('Terza')).toHaveFocus()
  })

  it('Home e Fine vanno alle due estremità', async () => {
    render(<Schermata />)
    await userEvent.tab()

    await userEvent.keyboard('{End}')
    expect(linguetta('Terza')).toHaveFocus()

    await userEvent.keyboard('{Home}')
    expect(linguetta('Prima')).toHaveFocus()
  })
})

/* Un `aria-controls` che punta a un id inesistente dice una cosa falsa, ed è
 * peggio del non dirla: il legame esiste solo dove il contenuto porta il
 * proprio pannello. */
describe('il legame con il contenuto', () => {
  it('ogni linguetta cita il pannello che comanda', () => {
    render(<Schermata base="prova" />)

    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'id',
      linguetta('Prima').getAttribute('aria-controls'),
    )
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      linguetta('Prima').getAttribute('id'),
    )
  })

  it('senza pannello non cita niente', () => {
    render(<Schermata />)

    expect(linguetta('Prima')).not.toHaveAttribute('aria-controls')
  })
})
