import { useEffect, useState } from 'react'
import { usePersonaPromptPreview } from '../hooks/usePersonaPrompt'
import type { PersonaChannel } from '../services/admin'
import { fieldLabel } from './avatarProfileConfig'
import LoadingState from './LoadingState'
import ModalShell from './ModalShell'
import { CloseIcon } from './icons'

/* Il prompt che la scheda produce davvero, mostrato prima di salvare.
 *
 * Serve a rendere visibile lo scarto fra il form e ciò che l'avatar riceve:
 * i campi vuoti spariscono, i marcatori tipo "/" vengono scartati, e il
 * canale cambia l'inquadratura (al telefono o in chat). È il modo più
 * rapido per capire se una scheda è scritta bene, senza avviare una
 * simulazione. */

const CHANNELS: { value: PersonaChannel; label: string }[] = [
  { value: 'voice', label: 'Chiamata' },
  { value: 'text', label: 'Chat' },
]

const tabBase =
  'cursor-pointer rounded-lg px-4 py-1.5 text-[0.8rem] font-semibold transition disabled:cursor-not-allowed'
const tabActive = 'bg-violet-600/20 text-violet-300'
const tabInactive = 'text-slate-400 hover:bg-white/6 hover:text-slate-100'

interface Props {
  profile: Record<string, string>
  onClose: () => void
}

export default function PersonaPromptPreview({ profile, onClose }: Props) {
  const [channel, setChannel] = useState<PersonaChannel>('voice')
  const [copied, setCopied] = useState(false)

  const {
    data: preview,
    isPending: isLoading,
    error: previewError,
  } = usePersonaPromptPreview(profile, channel)
  const error = previewError
    ? previewError instanceof Error
      ? previewError.message
      : "Impossibile generare l'anteprima."
    : ''

  // Esc chiude, come negli altri modali della pagina
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const copy = async () => {
    if (!preview) return
    await navigator.clipboard.writeText(preview.prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <ModalShell onClose={onClose} size="xl" padding="sm" layout="column" elevated hideClose>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-[1.25rem] font-bold text-slate-100">
            Anteprima del Prompt
          </h2>
          <p className="text-[0.8rem] text-slate-500">
            Il contenuto che l'avatar riceve effettivamente da questa scheda.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-xl border border-white/6 bg-white/4 p-1">
            {CHANNELS.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`${tabBase} ${channel === c.value ? tabActive : tabInactive}`}
                onClick={() => setChannel(c.value)}
                disabled={isLoading}
              >
                {c.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="cursor-pointer rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-[0.8rem] font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={copy}
            disabled={!preview}
          >
            {copied ? 'Copiato' : 'Copia'}
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 transition hover:bg-white/8 hover:text-slate-100"
            onClick={onClose}
            aria-label="Chiudi Anteprima"
          >
            <CloseIcon size={18} />
          </button>
        </div>
      </div>

      {preview && preview.ignored_fields.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[0.8rem] text-amber-300">
          <strong className="font-semibold">Campi compilati ma ignorati:</strong>{' '}
          {preview.ignored_fields.map(fieldLabel).join(', ')}. Contengono un marcatore di vuoto (per
          esempio "/" oppure "n/d"): l'avatar non li riceve, quindi è preferibile lasciarli
          effettivamente vuoti.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[0.82rem] text-red-300">
          {error}
        </div>
      )}

      {isLoading ? (
        <LoadingState variant="panel" message="Generazione anteprima..." />
      ) : (
        preview && (
          <pre className="flex-1 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-white/6 bg-slate-950/60 p-5 font-mono text-[0.78rem] leading-relaxed text-slate-300">
            {preview.prompt}
          </pre>
        )
      )}
    </ModalShell>
  )
}
