/* Da un caso raccontato a una bozza di scheda persona.
 *
 * È il gemello della generazione delle domande di una simulazione: una fonte
 * scritta da una persona, una passata del modello, e una revisione umana
 * prima che diventi qualcosa. Qui la revisione è il form che sta dietro
 * questa modale, dove la bozza arriva campo per campo.
 *
 * La modale non salva niente e non decide niente: consegna la scheda a chi
 * l'ha aperta e si chiude. Cosa tenerne lo decide il form (vedi applyDraft in
 * avatarForm). */

import { useState } from 'react'

import { useDraftPersona } from '../hooks/useAdminAvatars'
import type { PersonaDraftSource } from '../services/admin'
import { fieldCls, labelCls, textareaCls } from './Field'
import FilterTabs from './FilterTabs'
import FormError from './FormError'
import ModalShell from './ModalShell'
import PrimaryButton from './PrimaryButton'
import Spinner from './Spinner'

/* Sotto questa lunghezza il server rifiuta, ed è la stessa soglia: da tre
 * parole il modello inventa uno scenario suo, che è esattamente quello che
 * chi genera una scheda non vuole. Scritta qui perché il bottone possa
 * spegnersi prima di partire, invece di far tornare un errore. */
const MIN_CHARS = 40

const SOURCES: { value: PersonaDraftSource; label: string }[] = [
  { value: 'descrizione', label: 'Un Caso' },
  { value: 'conversazione', label: 'Una Conversazione' },
]

const HINTS: Record<PersonaDraftSource, string> = {
  descrizione:
    "Descrivi il caso come lo esporresti a un collega: chi chiama, cosa è accaduto e quale competenza deve esercitare l'operatore. Il resto della scheda viene composto attorno a questi elementi.",
  conversazione:
    'Incolla una conversazione reale, già priva dei dati identificativi delle persone coinvolte. Dal testo vengono ricavati il modo di esprimersi del cliente e il motivo del contatto, e vengono composti solo gli elementi mancanti.',
}

const PLACEHOLDERS: Record<PersonaDraftSource, string> = {
  descrizione:
    'Es. Un cliente vede due addebiti uguali sulla carta nello stesso giorno e chiama convinto di essere stato truffato. In realtà è una preautorizzazione di un noleggio auto non ancora stornata. Voglio verificare se l’operatore sa distinguere le due cose senza dare la colpa al cliente.',
  conversazione:
    'Operatore: Buongiorno, servizio clienti...\nCliente: Buongiorno, guardi, ho un problema...',
}

interface Props {
  onClose: () => void
  /** La bozza pronta, che il form fa entrare nella scheda con le sue regole. */
  onDrafted: (profile: Record<string, string>) => void
}

export default function PersonaDraftModal({ onClose, onDrafted }: Props) {
  const [source, setSource] = useState<PersonaDraftSource>('descrizione')
  const [text, setText] = useState('')

  const draftMutation = useDraftPersona()
  const isPending = draftMutation.isPending
  const error = draftMutation.error
    ? draftMutation.error instanceof Error
      ? draftMutation.error.message
      : 'Impossibile generare la scheda.'
    : ''

  const troppoCorto = text.trim().length < MIN_CHARS

  const generate = async () => {
    if (troppoCorto) return
    draftMutation.reset()
    try {
      const { profile } = await draftMutation.mutateAsync({
        text: text.trim(),
        source,
      })
      onDrafted(profile)
    } catch {
      // Il messaggio è nella mutation, il banner qui sopra lo mostra
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      locked={isPending}
      size="md"
      padding="md"
      elevated
      label="Genera la Scheda"
    >
      <div className="mb-6">
        <h2 className="mb-1 font-heading text-[1.2rem] font-bold text-slate-100">
          Genera la Scheda
        </h2>
        <p className="text-[0.8rem] leading-relaxed text-slate-500">
          Il modello propone una scheda completa, da rivedere prima del salvataggio. I campi già
          compilati restano invariati.
        </p>
      </div>

      {error && <FormError message={error} />}

      <div className="flex flex-col gap-4">
        <div className={fieldCls}>
          <span className={labelCls}>Punto di partenza</span>
          <FilterTabs
            value={source}
            onChange={(value) => setSource(value)}
            options={SOURCES}
            ariaLabel="Origine della scheda"
          />
          <p className="text-[0.72rem] leading-relaxed text-slate-500">{HINTS[source]}</p>
        </div>

        <div className={fieldCls}>
          <label className={labelCls} htmlFor="draft-text">
            {source === 'descrizione' ? 'Il caso' : 'La conversazione'}
          </label>
          <textarea
            id="draft-text"
            className={textareaCls}
            rows={source === 'descrizione' ? 6 : 10}
            placeholder={PLACEHOLDERS[source]}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isPending}
          />
          {/* Il conto compare solo finché serve: a soglia superata non è più
              una cosa da sapere. */}
          {troppoCorto && text.length > 0 && (
            <p className="text-[0.7rem] text-slate-500">
              Ancora {MIN_CHARS - text.trim().length} caratteri: da poche parole il modello
              comporrebbe un caso non aderente.
            </p>
          )}
        </div>

        <PrimaryButton
          type="button"
          variant="submit"
          className="mt-2"
          onClick={generate}
          disabled={isPending || troppoCorto}
        >
          {isPending ? (
            <>
              <Spinner variant="button" />
              Scrittura della scheda in corso...
            </>
          ) : (
            'Genera la bozza'
          )}
        </PrimaryButton>
        {isPending && (
          <p className="text-center text-[0.72rem] text-slate-500">
            L'operazione richiede circa venti secondi: vengono compilati una settantina di campi che
            devono risultare coerenti fra loro
          </p>
        )}
      </div>
    </ModalShell>
  )
}
