/* Quante tappe di un percorso sono chiuse, come anello.
 *
 * Serve dove un percorso si presenta tutto in una riga (l'elenco dei propri
 * percorsi, il riepilogo in home) e non c'è spazio per il sentiero: l'anello
 * dice la stessa cosa in 56 pixel, cioè quanto manca alla fine.
 *
 * Il gradiente è quello del sentiero acceso sulla mappa, così i due disegni
 * si riconoscono come la stessa cosa. Ha un `id` unico per istanza perché due
 * anelli sulla stessa pagina sono normali, e due `defs` con lo stesso nome si
 * annullerebbero a vicenda. */

import { useId } from 'react'

export default function PathProgressRing({
  done,
  total,
  size = 56,
}: {
  done: number
  total: number
  size?: number
}) {
  // Senza i due punti, che dentro un `url(#...)` non tutti i browser digeriscono
  const gradientId = `ring${useId().replace(/:/g, '')}`
  const stroke = 5
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const value = total === 0 ? 0 : Math.min(1, done / total)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={value >= 1 ? '#10b981' : `url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[0.78rem] font-bold tabular-nums text-slate-100">
        {done}/{total}
      </span>
    </div>
  )
}
