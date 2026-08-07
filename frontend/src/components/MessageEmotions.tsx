import type { ParsedEmotion } from './emotionTag'
import Tooltip from './Tooltip'

/** Riga compatta "Tono di voce" da mostrare dentro la bolla del messaggio
 * utente (sfondo viola, testo bianco). Le emozioni arrivano già lette da
 * `splitEmotionTag`, in `emotionTag.ts`. */
export default function MessageEmotions({ emotions }: { emotions: ParsedEmotion[] }) {
  if (emotions.length === 0) return null

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-white/10 pt-1.5 text-[0.6rem] leading-tight">
      <span className="font-semibold uppercase tracking-wide text-white/50">Tono</span>
      {emotions.map((e) => (
        <Tooltip
          key={e.raw}
          content={
            <>
              <span className="font-semibold text-slate-100">{e.label}</span>
              {e.intensityLabel && ` · ${e.intensityLabel}`}
              <span className="block text-[0.65rem] text-slate-500">rilevato: “{e.raw}”</span>
            </>
          }
        >
          <span className="inline-flex cursor-default items-baseline gap-0.5 rounded-full border border-white/25 px-1.5 py-px text-white/80">
            {e.label}
            <span aria-hidden className="text-[0.4rem] leading-none tracking-[0.1em]">
              {'●'.repeat(e.level)}
              <span className="opacity-30">{'●'.repeat(3 - e.level)}</span>
            </span>
          </span>
        </Tooltip>
      ))}
    </div>
  )
}
