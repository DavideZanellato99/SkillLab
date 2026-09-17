import { useEffect, useState } from 'react'
import type { ScreenRecordingInfo } from '../services/simulations'
import { fetchScreenRecordingBlob } from '../services/simulations'
import Badge from './Badge'
import Spinner from './Spinner'
import { DownloadIcon, MonitorIcon, PlayIcon } from './icons'
import { formatClock } from './simulationFormat'

/* Lo schermo registrato durante un test, riletto da chi corregge.
 *
 * Il gemello di `CallRecordingPlayer` per il video, e con la stessa
 * economia: i metadati arrivano già con il tentativo, il video si scarica
 * solo quando qualcuno preme. Cento megabyte non si muovono per un
 * tentativo aperto per leggere il voto.
 *
 * Tre stati, e li dice tutti e tre. Registrazione presente: il pulsante con
 * durata e peso, e poi il lettore. Prevista e assente: il caricamento non è
 * arrivato, e chi corregge lo deve leggere accanto al voto invece di
 * cercare un pulsante che non c'è. Non prevista: niente, il riquadro non
 * compare, perché un test senza spunta non deve sembrare un test a cui
 * manca qualcosa.
 *
 * L'interruzione è scritta sopra il lettore e non scoperta guardando il
 * video finire a metà: dice che il test è stato consegnato in quel momento,
 * che è la cosa che spiega le risposte in bianco dopo. */

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function extensionFor(mimeType: string): string {
  return mimeType.includes('mp4') ? 'mp4' : 'webm'
}

interface ScreenRecordingPlayerProps {
  attemptId: string
  expected: boolean
  info: ScreenRecordingInfo | null
}

export default function ScreenRecordingPlayer({
  attemptId,
  expected,
  info,
}: ScreenRecordingPlayerProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // L'object URL si revoca quando viene sostituito o quando il lettore va
  // via: una sessione di correzione non deve lasciare blob in giro.
  useEffect(() => {
    if (!videoUrl) return
    return () => URL.revokeObjectURL(videoUrl)
  }, [videoUrl])

  if (!expected) return null

  const handleLoad = async () => {
    setIsLoading(true)
    setError('')
    try {
      const blob = await fetchScreenRecordingBlob(attemptId)
      setVideoUrl(URL.createObjectURL(blob))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile caricare la registrazione.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-white/6 bg-gray-900/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold text-slate-100">
          <MonitorIcon size={15} className="text-violet-400" />
          Registrazione dello schermo
        </h3>
        {info?.interrupted && (
          <Badge tone="border border-amber-500/30 bg-amber-500/10 text-amber-300">
            Interrotta prima della consegna
          </Badge>
        )}
        {info === null && (
          <Badge tone="border border-amber-500/30 bg-amber-500/10 text-amber-300">
            Non pervenuta
          </Badge>
        )}
      </div>

      {info === null ? (
        <p className="mt-2 text-[0.85rem] text-slate-400">
          Il test prevedeva la registrazione dello schermo, ma il caricamento non è mai arrivato.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {info.interrupted && (
            <p className="text-[0.85rem] text-slate-400">
              La condivisione dello schermo è stata interrotta durante il test, che è stato
              consegnato in quel momento con le risposte fornite fino a lì. Il video termina
              all'interruzione.
            </p>
          )}
          {videoUrl ? (
            <>
              {/* Senza autoplay: è un video di qualche minuto in una schermata
                  aperta per leggere delle risposte, e deve partire quando lo
                  si guarda. */}
              <video
                className="max-h-[60vh] w-full rounded-xl border border-white/6 bg-black"
                controls
                src={videoUrl}
                aria-label="Registrazione dello schermo durante il test"
              />
              <a
                className="flex w-fit items-center gap-1.5 text-[0.72rem] text-slate-500 transition hover:text-violet-400"
                href={videoUrl}
                download={`schermo-${attemptId}.${extensionFor(info.mime_type)}`}
              >
                <DownloadIcon size={13} />
                Scarica il Video
              </a>
            </>
          ) : (
            <button
              type="button"
              className="flex w-fit cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-[0.85rem] font-medium text-slate-400 transition hover:-translate-y-px hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              onClick={handleLoad}
              disabled={isLoading}
            >
              {isLoading ? <Spinner variant="small" /> : <PlayIcon size={14} />}
              {isLoading
                ? 'Caricamento...'
                : `Guarda la registrazione · ${[
                    info.duration_ms !== null ? formatClock(info.duration_ms) : null,
                    formatSize(info.size_bytes),
                  ]
                    .filter(Boolean)
                    .join(' · ')}`}
            </button>
          )}
          {error && <p className="text-[0.72rem] text-red-400">{error}</p>}
        </div>
      )}
    </section>
  )
}
