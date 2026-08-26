import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import AvatarProfileSections from '../../src/components/AvatarProfileSections'
import { PROFILE_SECTIONS } from '../../src/components/avatarProfileConfig'

/* La fisarmonica della scheda persona: quando si apre da sola e quando la si
 * apre a mano.
 *
 * Il motivo per cui esiste è che ottanta campi aperti insieme sono uno scroll
 * di parecchi schermi. Il motivo per cui deve potersi aprire tutta è l'altro
 * lato della stessa cosa: dopo una bozza, quello che ha scritto il modello va
 * riletto prima di salvare, e otto pannelli chiusi rendono quel passo tanto
 * scomodo da farlo saltare. */

const PRIMA_SEZIONE = PROFILE_SECTIONS[0].title
const ULTIMA_SEZIONE = PROFILE_SECTIONS[PROFILE_SECTIONS.length - 1].title

/** Un campo che sta nell'ultima sezione: c'è solo se quella è aperta. */
const CAMPO_IN_FONDO = PROFILE_SECTIONS[PROFILE_SECTIONS.length - 1].fields[0].label

/** Un campo della prima sezione, che parte aperta. */
const CAMPO_IN_CIMA = PROFILE_SECTIONS[0].fields[0].label

function renderSections(expandSignal?: number) {
  const onFieldChange = vi.fn()
  const view = render(
    <AvatarProfileSections
      profile={{}}
      onFieldChange={onFieldChange}
      disabled={false}
      expandSignal={expandSignal}
    />,
  )
  return { ...view, onFieldChange }
}

describe('AvatarProfileSections', () => {
  it('parte con la sola anagrafica aperta, che è da dove si comincia', () => {
    renderSections()

    expect(screen.getByLabelText(CAMPO_IN_CIMA)).toBeInTheDocument()
    expect(screen.queryByLabelText(CAMPO_IN_FONDO)).not.toBeInTheDocument()
  })

  it('apre e richiude una sezione alla volta', async () => {
    renderSections()

    await userEvent.click(screen.getByRole('button', { name: new RegExp(ULTIMA_SEZIONE) }))
    expect(screen.getByLabelText(CAMPO_IN_FONDO)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: new RegExp(ULTIMA_SEZIONE) }))
    expect(screen.queryByLabelText(CAMPO_IN_FONDO)).not.toBeInTheDocument()
  })

  it('apre tutte le sezioni in un gesto, e le richiude allo stesso modo', async () => {
    renderSections()

    await userEvent.click(screen.getByRole('button', { name: 'Apri Tutte le Sezioni' }))
    expect(screen.getByLabelText(CAMPO_IN_FONDO)).toBeInTheDocument()
    expect(screen.getByLabelText(CAMPO_IN_CIMA)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Chiudi Tutte le Sezioni' }))
    expect(screen.queryByLabelText(CAMPO_IN_FONDO)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(CAMPO_IN_CIMA)).not.toBeInTheDocument()
  })

  /* Il valore iniziale non è un segnale: aprire la scheda di un avatar non
   * deve spalancare otto pannelli a chi voleva correggere un campo solo. */
  it('non si apre tutta solo perché il segnale esiste', () => {
    renderSections(0)

    expect(screen.queryByLabelText(CAMPO_IN_FONDO)).not.toBeInTheDocument()
  })

  it('si apre tutta quando una bozza è appena entrata nella scheda', () => {
    const { rerender } = renderSections(0)

    rerender(
      <AvatarProfileSections
        profile={{}}
        onFieldChange={vi.fn()}
        disabled={false}
        expandSignal={1}
      />,
    )

    expect(screen.getByLabelText(CAMPO_IN_FONDO)).toBeInTheDocument()
  })

  /* Due bozze di seguito: la seconda deve riaprire quello che nel frattempo
   * si era richiuso, ed è la ragione per cui il segnale è un contatore e non
   * un interruttore. */
  it('riapre tutto a ogni bozza successiva', async () => {
    const { rerender } = renderSections(1)

    await userEvent.click(screen.getByRole('button', { name: 'Chiudi Tutte le Sezioni' }))
    expect(screen.queryByLabelText(CAMPO_IN_FONDO)).not.toBeInTheDocument()

    rerender(
      <AvatarProfileSections
        profile={{}}
        onFieldChange={vi.fn()}
        disabled={false}
        expandSignal={2}
      />,
    )

    expect(screen.getByLabelText(CAMPO_IN_FONDO)).toBeInTheDocument()
  })

  it('dice quanti campi sono compilati senza costringere ad aprire', () => {
    const chiave = PROFILE_SECTIONS[0].fields[0].key
    render(
      <AvatarProfileSections
        profile={{ [chiave]: 'Mario' }}
        onFieldChange={vi.fn()}
        disabled={false}
      />,
    )

    const intestazione = screen.getByRole('button', { name: new RegExp(PRIMA_SEZIONE) })
    expect(intestazione).toHaveTextContent(`1/${PROFILE_SECTIONS[0].fields.length}`)
  })
})
