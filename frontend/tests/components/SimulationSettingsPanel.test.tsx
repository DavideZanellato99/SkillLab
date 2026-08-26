import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { SimulationAdminDetail } from '../../src/services/simulations'
import SimulationSettingsPanel from '../../src/components/SimulationSettingsPanel'

/* Il pannello ha due promesse: si correggono i dati che si possono correggere
 * senza contraddire le domande, e il documento non si sostituisce per sbaglio. */

const simulazione = (over: Partial<SimulationAdminDetail> = {}): SimulationAdminDetail =>
  ({
    id: 's-1',
    organization_id: 'org-1',
    organization_name: 'Banca Esempio',
    title: 'Normativa antiriciclaggio',
    description: 'Le verifiche di primo livello',
    status: 'draft',
    kind: 'multiple',
    source: 'ai',
    document_name: 'procedura-v2.pdf',
    question_count: 50,
    created_at: '2026-03-01T09:00:00',
    updated_at: '2026-03-01T09:00:00',
    last_attempt_at: null,
    last_attempt_score: null,
    attempt_count: 0,
    created_by_email: 'admin@esempio.it',
    updated_by_email: null,
    questions: [],
    chunk_count: 12,
    total_attempts: 0,
    review: null,
    ...over,
  }) as SimulationAdminDetail

function renderPanel(over: Partial<SimulationAdminDetail> = {}, props = {}) {
  const simulation = simulazione(over)
  const onChange = vi.fn()
  const onSave = vi.fn()
  const onReplaceDocument = vi.fn()
  render(
    <SimulationSettingsPanel
      simulation={simulation}
      title={simulation.title}
      description={simulation.description ?? ''}
      onChange={onChange}
      onSave={onSave}
      isSaving={false}
      saved={false}
      error=""
      onReplaceDocument={onReplaceDocument}
      isReplacing={false}
      documentError=""
      {...props}
    />,
  )
  return { simulation, onChange, onSave, onReplaceDocument }
}

/* Il campo che sceglie il file sta nascosto dietro al bottone che lo apre,
 * quindi non ha un nome da cercare: si prende com'è. */
function fileField(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement
}

describe('SimulationSettingsPanel', () => {
  it('mostra titolo e descrizione come sono sul server', () => {
    renderPanel()

    expect(screen.getByLabelText('Titolo')).toHaveValue('Normativa antiriciclaggio')
    expect(screen.getByLabelText('Descrizione')).toHaveValue('Le verifiche di primo livello')
  })

  /* Salvare quello che è già salvato è una scrittura per niente, e il bottone
     acceso su un form intonso fa dubitare di aver toccato qualcosa. */
  it('tiene spento il salvataggio finché niente è cambiato', () => {
    renderPanel()

    expect(screen.getByRole('button', { name: 'Salva i dati' })).toBeDisabled()
  })

  it('salva quando il titolo è cambiato', async () => {
    const { onSave } = renderPanel({}, { title: 'Normativa antiriciclaggio 2026' })

    await userEvent.click(screen.getByRole('button', { name: 'Salva i dati' }))

    expect(onSave).toHaveBeenCalled()
  })

  /* Il titolo è la sola cosa con cui un test si riconosce in tabella e
     nell'elenco di chi lo deve svolgere: senza, la riga resterebbe muta. */
  it('non lascia salvare un titolo vuoto', () => {
    renderPanel({}, { title: '   ' })

    expect(screen.getByRole('button', { name: 'Salva i dati' })).toBeDisabled()
  })

  it('scrive nei campi passando la coppia intera', async () => {
    const { onChange } = renderPanel()

    await userEvent.type(screen.getByLabelText('Titolo'), '!')

    expect(onChange).toHaveBeenCalledWith({
      title: 'Normativa antiriciclaggio!',
      description: 'Le verifiche di primo livello',
    })
  })

  /* «Dati aggiornati» sopra un titolo riscritto nel frattempo direbbe una
     cosa falsa: il buon esito vale finché i campi sono quelli salvati. */
  it('mostra il buon esito finché i campi restano quelli salvati', () => {
    renderPanel({}, { saved: true })

    expect(screen.getByText('Dati aggiornati')).toBeInTheDocument()
  })

  it('nasconde il buon esito appena un campo cambia', () => {
    renderPanel({}, { saved: true, title: 'Un altro titolo' })

    expect(screen.queryByText('Dati aggiornati')).not.toBeInTheDocument()
  })

  it('legge il documento indicizzato accanto ai suoi passaggi', () => {
    renderPanel()

    expect(screen.getByText('procedura-v2.pdf')).toBeInTheDocument()
    expect(screen.getByText('12 passaggi indicizzati')).toBeInTheDocument()
  })

  /* Su un test scritto a mano un documento non c'è mai stato, e la strada per
     averlo non è caricarlo qui: il server risponderebbe 409. */
  it('non offre il documento dove non ce n’è uno', () => {
    renderPanel({ source: 'manual', document_name: '' })

    expect(screen.queryByRole('button', { name: 'Sostituisci il documento' })).toBeNull()
    expect(screen.queryByText('Documento')).toBeNull()
  })

  /* La sostituzione cancella i passaggi di prima e ne indicizza di nuovi:
     non parte dal clic con cui si sceglie un file. */
  it('chiede conferma prima di sostituire il documento, e dice che le domande restano', async () => {
    const { onReplaceDocument } = renderPanel({
      questions: [{ id: 'q-1' }, { id: 'q-2' }] as SimulationAdminDetail['questions'],
    })

    const file = new File(['contenuto'], 'procedura-v3.pdf', { type: 'application/pdf' })
    await userEvent.upload(fileField(), file)

    expect(onReplaceDocument).not.toHaveBeenCalled()
    expect(screen.getByText('procedura-v3.pdf')).toBeInTheDocument()
    expect(screen.getByText(/2 domande già scritte restano dove sono/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Sostituisci e indicizza' }))

    expect(onReplaceDocument).toHaveBeenCalledWith(file, expect.any(Function))
  })

  it('lascia il documento com’era se la conferma viene annullata', async () => {
    const { onReplaceDocument } = renderPanel()

    const file = new File(['contenuto'], 'procedura-v3.pdf', { type: 'application/pdf' })
    await userEvent.upload(fileField(), file)
    await userEvent.click(screen.getByRole('button', { name: 'Annulla' }))

    expect(onReplaceDocument).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Sostituisci e indicizza' })).toBeNull()
  })

  /* Mentre un'altra operazione del pannello è in corso qui non si tocca
     niente: una generazione che riscrive le domande non deve incrociarsi con
     un documento che cambia sotto. */
  it('si spegne quando il pannello è occupato', () => {
    renderPanel({}, { disabled: true, title: 'Un altro titolo' })

    expect(screen.getByRole('button', { name: 'Salva i dati' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sostituisci il documento' })).toBeDisabled()
  })

  /* Il rifiuto si legge nel momento in cui il file si sceglie, non dopo
     l'attesa di un caricamento andato a vuoto: un documento oltre il tetto
     occuperebbe la linea per minuti e tornerebbe indietro come errore. */
  it('rifiuta subito un documento che il server non accetterebbe', async () => {
    const { onReplaceDocument } = renderPanel()

    const enorme = new File(['x'], 'manuale.pdf', { type: 'application/pdf' })
    Object.defineProperty(enorme, 'size', { value: 30 * 1024 * 1024 })
    await userEvent.upload(fileField(), enorme)

    expect(screen.getByText('Il documento non può superare 10 MB.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sostituisci e indicizza' })).toBeNull()
    expect(onReplaceDocument).not.toHaveBeenCalled()
  })

  it('riporta l’errore del salvataggio', () => {
    renderPanel({}, { error: 'Il titolo è obbligatorio.' })

    expect(screen.getByText('Il titolo è obbligatorio.')).toBeInTheDocument()
  })
})
