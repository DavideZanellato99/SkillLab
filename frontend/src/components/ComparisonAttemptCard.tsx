import type { ReactNode } from 'react'
import ComparisonOpenButton from './ComparisonOpenButton'
import { formatScore, scoreTextColor } from './scoreFormat'

/* Una delle due prove affiancate, in fondo al confronto: di quale prova si
 * trattava, e il comando per aprirla per intero.
 *
 * Uguale nelle due metà perché è la stessa card in due posti: era scritta due
 * volte, e le due copie avevano già in comune la targhetta del posto, il
 * titolo, le targhette della specie, il voto in piccolo, la riga di contorno
 * e il comando in fondo. Cambia solo quello che sta in mezzo, che è il
 * motivo per cui esistono due metà: le parole della valutazione da una
 * parte, quante risposte sono andate a segno dall'altra.
 *
 * Il voto grande sta nel verdetto e qui compare in piccolo accanto al nome:
 * scritto due volte in grande, il numero avrebbe fatto cercare la differenza
 * fra le due card proprio dove è già stata calcolata. */
export default function ComparisonAttemptCard({
  role,
  title,
  badges,
  score,
  meta,
  openLabel,
  openAriaLabel,
  onOpen,
  children,
}: {
  /** Il posto nel confronto: "Prima", "Dopo". Le stesse due parole del
   *  verdetto, delle intestazioni e della fila da cui si sceglie. */
  role: string
  /** Come si riconosce la prova: il titolo della conversazione o del test. */
  title: string
  /** Le targhette della specie: canale, oppure tipo e origine del test. */
  badges?: ReactNode
  score: number
  /** La riga di contorno sotto il titolo: lo scenario e la data, o la data. */
  meta: ReactNode
  /** Cosa si va a leggere: "Apri la Trascrizione", "Apri il Tentativo". */
  openLabel: string
  /** Lo stesso comando con dentro la prova a cui appartiene. */
  openAriaLabel: string
  onOpen: () => void
  /** Quello che il verdetto non riassume, diverso nelle due metà. */
  children?: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/6 bg-gray-900/60 p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white/6 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400">
          {role}
        </span>
        <span className="text-[0.85rem] text-slate-200">{title}</span>
        {badges}
        <span className={`text-[0.85rem] font-bold ${scoreTextColor(score)}`}>
          {formatScore(score)}
        </span>
      </div>
      <p className="text-[0.72rem] text-slate-500">{meta}</p>

      {children}

      <ComparisonOpenButton label={openLabel} ariaLabel={openAriaLabel} onClick={onOpen} />
    </div>
  )
}
