import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* La scheda di un avatar: cosa succede chiudendola con qualcosa dentro, e
 * l'anteprima di una voce.
 *
 * Sono le due cose che qui dentro si pagano care. La prima perché la scheda
 * ha una settantina di campi e una bozza generata è costata una chiamata a
 * un modello: chiudere per sbaglio li porta via tutti. La seconda perché lo
 * stato dell'ascolto raccontava il falso, e da lì venivano due anteprime
 * sovrapposte. */

const mutazione = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null as Error | null,
}))
const voci = vi.hoisted(() => ({
  data: [{ id: 'voce-1', name: 'Sofia' }] as { id: string; name: string }[],
  error: null as Error | null,
}))

vi.mock('../../src/hooks/useAdminAvatars', () => ({
  useCreateAvatar: () => mutazione,
  useUpdateAvatar: () => mutazione,
  useUploadAvatarImage: () => mutazione,
  useVoices: () => voci,
}))
vi.mock('../../src/hooks/useAvatarCategories', () => ({
  useAvatarCategories: () => ({ data: [{ id: 'cat-1', name: 'Clienti' }] }),
}))

const anteprimaVocale = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('../../src/services/admin', () => ({
  fetchVoicePreview: (...args: unknown[]) => anteprimaVocale.fetch(...args),
}))

/* La bozza è una modale sua, con dentro una chiamata al modello: qui basta
 * il gesto che consegna una scheda al form. */
vi.mock('../../src/components/PersonaDraftModal', () => ({
  default: ({ onDrafted }: { onDrafted: (p: Record<string, string>) => void }) => (
    <button onClick={() => onDrafted({ SEGRETI: 'Sta valutando di cambiare banca' })}>
      consegna la bozza
    </button>
  ),
}))

import type { AdminAvatar } from '../../src/services/admin'
import AvatarFormModal from '../../src/components/AvatarFormModal'

const avatar = (over: Partial<AdminAvatar> = {}): AdminAvatar =>
  ({
    id: 'av-1',
    name: 'Mario Rossi',
    image_url: '/static/avatars/mario.png',
    category: 'Clienti',
    category_id: 'cat-1',
    category_color: 'orange',
    description: 'Cliente irritato',
    voice_id: 'voce-1',
    organization_id: 'org-1',
    organization_name: 'Banca Esempio',
    conversation_count: 3,
    deleted_at: null,
    profile: { NOME: 'Mario', COGNOME: 'Rossi' },
    created_at: '2026-01-01T10:00:00Z',
    created_by_email: 'sistema',
    updated_at: '2026-01-01T10:00:00Z',
    updated_by_email: 'sistema',
    ...over,
  }) as AdminAvatar

function renderForm(target: AdminAvatar | 'new' = avatar()) {
  const onClose = vi.fn()
  render(
    <AvatarFormModal
      target={target}
      organizationOptions={[{ value: 'org-1', label: 'Banca Esempio' }]}
      onClose={onClose}
      onSaved={vi.fn()}
      onManageCategories={vi.fn()}
    />,
  )
  return { onClose }
}

const brief = () => screen.getByLabelText(/Brief per l'operatore/)

beforeEach(() => {
  mutazione.mutateAsync.mockReset()
  mutazione.isPending = false
  mutazione.error = null
  voci.data = [{ id: 'voce-1', name: 'Sofia' }]
  voci.error = null
  anteprimaVocale.fetch.mockReset()
})

// ── Chiudere con qualcosa dentro ────────────────────────────────────────

describe('la conferma di uscita', () => {
  it('non chiede niente per una scheda che non è stata toccata', async () => {
    const { onClose } = renderForm()

    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog', { name: 'Chiudi senza Salvare' })).not.toBeInTheDocument()
  })

  it('si mette in mezzo quando qualcosa è cambiato', async () => {
    const { onClose } = renderForm()

    await userEvent.type(brief(), '!')
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }))

    expect(await screen.findByRole('dialog', { name: 'Chiudi senza Salvare' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('lascia uscire chi conferma', async () => {
    const { onClose } = renderForm()

    await userEvent.type(brief(), '!')
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Chiudi senza Salvare' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('riporta alla scheda chi ci ripensa', async () => {
    const { onClose } = renderForm()

    await userEvent.type(brief(), '!')
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Annulla' }))

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Chiudi senza Salvare' }),
      ).not.toBeInTheDocument(),
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(brief()).toBeInTheDocument()
  })

  /* Torna indietro conta come non aver toccato niente: la conferma esiste per
   * quello che si perderebbe, e se non si perde niente è solo un ostacolo. */
  it("sparisce se si rimette tutto com'era", async () => {
    const { onClose } = renderForm()

    await userEvent.type(brief(), '!')
    await userEvent.type(brief(), '{backspace}')
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})

// ── L'anteprima di una voce ─────────────────────────────────────────────

class AudioFinto {
  static ultimo: AudioFinto | null = null
  src: string
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  play = vi.fn(async () => {})
  pause = vi.fn()

  constructor(src: string) {
    this.src = src
    AudioFinto.ultimo = this
  }
}

describe("l'anteprima di una voce", () => {
  beforeEach(() => {
    AudioFinto.ultimo = null
    vi.stubGlobal('Audio', AudioFinto)
    URL.createObjectURL = vi.fn(() => 'blob:anteprima')
    URL.revokeObjectURL = vi.fn()
    anteprimaVocale.fetch.mockResolvedValue(new Blob(['audio']))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const bottoneAscolto = () => screen.getByRole('button', { name: 'Ascolta Anteprima della Voce' })

  /* `play()` mantiene la promessa appena il suono comincia, non quando
   * finisce: spegnere lì dava una rotella che lampeggiava per un istante e
   * il bottone di nuovo premibile con la voce ancora in corso. */
  it('resta in ascolto finché la battuta non è finita', async () => {
    renderForm()

    await userEvent.click(bottoneAscolto())

    expect(
      await screen.findByRole('button', { name: 'Interrompi Anteprima della Voce' }),
    ).toBeInTheDocument()
  })

  it("torna a proporre l'ascolto quando la battuta finisce", async () => {
    renderForm()

    await userEvent.click(bottoneAscolto())
    await screen.findByRole('button', { name: 'Interrompi Anteprima della Voce' })

    AudioFinto.ultimo?.onended?.()

    expect(
      await screen.findByRole('button', { name: 'Ascolta Anteprima della Voce' }),
    ).toBeEnabled()
  })

  /* Un'anteprima partita per sbaglio deve poter tacere senza aspettare, e
   * l'oggetto che la teneva in memoria va liberato. */
  it("si può interrompere, e l'audio non resta in memoria", async () => {
    renderForm()

    await userEvent.click(bottoneAscolto())
    const suonato = AudioFinto.ultimo
    await userEvent.click(
      await screen.findByRole('button', { name: 'Interrompi Anteprima della Voce' }),
    )

    expect(suonato?.pause).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:anteprima')
    expect(screen.getByRole('button', { name: 'Ascolta Anteprima della Voce' })).toBeEnabled()
  })

  it('dice perché non si sente niente quando il fornitore non risponde', async () => {
    anteprimaVocale.fetch.mockRejectedValue(new Error('Catalogo voci non disponibile.'))
    renderForm()

    await userEvent.click(bottoneAscolto())

    expect(await screen.findByText('Catalogo voci non disponibile.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ascolta Anteprima della Voce' })).toBeEnabled()
  })
})

// ── Il ritratto ─────────────────────────────────────────────────────────

describe('il campo del ritratto', () => {
  /* Il campo invitava a incollare un URL e poi il salvataggio lo rifiutava,
   * a scheda già compilata: adesso l'avviso arriva mentre si scrive. */
  it('avvisa subito che un indirizzo esterno non va bene', async () => {
    renderForm()

    await userEvent.clear(screen.getByPlaceholderText(/percorso di un'immagine/))
    await userEvent.type(
      screen.getByPlaceholderText(/percorso di un'immagine/),
      'https://esempio.it/foto.png',
    )

    expect(screen.getByText(/deve stare sull'applicazione/)).toBeInTheDocument()
  })

  it('non dice niente per un percorso di qui', async () => {
    renderForm()

    await userEvent.clear(screen.getByPlaceholderText(/percorso di un'immagine/))
    await userEvent.type(
      screen.getByPlaceholderText(/percorso di un'immagine/),
      '/static/avatars/mario.png',
    )

    expect(screen.queryByText(/deve stare sull'applicazione/)).not.toBeInTheDocument()
  })
})

// ── La bozza e la fisarmonica ───────────────────────────────────────────

describe('dopo una bozza', () => {
  /* La bozza riempie campi in tutte e otto le sezioni, e il messaggio chiede
   * di rileggerla: con i pannelli chiusi sarebbero otto aperture prima di
   * poter leggere la prima riga. */
  it('apre le sezioni, così quello che ha scritto il modello si vede', async () => {
    renderForm()

    expect(screen.queryByLabelText('Segreti (mai rivelati)')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Genera la Scheda/ }))
    await userEvent.click(screen.getByRole('button', { name: 'consegna la bozza' }))

    expect(await screen.findByLabelText('Segreti (mai rivelati)')).toBeInTheDocument()
    expect(screen.getByText(/Rileggila prima di salvare/)).toBeInTheDocument()
  })
})
