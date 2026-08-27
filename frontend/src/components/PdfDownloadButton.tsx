import { useState } from 'react'
import { saveBlob } from '../services/api'
import Spinner from './Spinner'
import { DownloadIcon } from './icons'

/* Il pulsante che scarica un referto in PDF, uno per tutta l'applicazione:
 * la valutazione di una conversazione a fine chiamata, la stessa riletta
 * dalla dashboard, l'esito di un test consegnato.
 *
 * Il file lo chiede chi ospita il pulsante, perché ogni referto ha il suo
 * endpoint e alcuni ne hanno due, uno per chi l'ha svolto e uno per chi
 * corregge. Qui restano le tre cose che sono uguali dappertutto: lo stato di
 * attesa, il nome del file e l'errore, che vive sotto il pulsante perché è
 * di chi ha premuto e non della schermata che lo ospita. */

interface PdfDownloadButtonProps {
  /** Carica il file. Una funzione e non un indirizzo: gli endpoint sono
   *  diversi e alcuni dipendono da chi sta guardando. */
  fetchPdf: () => Promise<Blob>
  /** I pezzi del nome del file, nell'ordine in cui si leggono, il primo dei
   *  quali dice di che referto si tratta: `['valutazione', 'anna']`. */
  fileNameParts: string[]
}

/** `valutazione-mario-rossi-anna.pdf`: minuscolo, senza accenti né spazi,
 *  perché il nome finisce in un file system che non li gradisce tutti. */
function pdfFileName(parts: string[]): string {
  const slug = parts
    .join('-')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'referto'}.pdf`
}

export default function PdfDownloadButton({ fetchPdf, fileNameParts }: PdfDownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const download = async () => {
    if (isDownloading) return
    setIsDownloading(true)
    setError(null)
    try {
      const blob = await fetchPdf()
      saveBlob(blob, pdfFileName(fileNameParts))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download del PDF non riuscito.')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/6 bg-white/4 px-5 py-2 text-sm font-medium text-slate-400 transition hover:-translate-y-px hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        onClick={() => void download()}
        disabled={isDownloading}
      >
        {isDownloading ? <Spinner variant="small" /> : <DownloadIcon size={15} />}
        Scarica PDF
      </button>
      {error && <p className="text-center text-[0.75rem] text-red-400">{error}</p>}
    </div>
  )
}
