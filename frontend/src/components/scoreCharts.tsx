import { useState, useEffect, useRef, useCallback } from 'react'
import Tooltip from './Tooltip'
import { cardCls, formatDay, formatScore, scoreBarColor, scoreTextColor } from './scoreFormat'
import type { DayPoint } from './scoreFormat'

/* I disegni con cui si mostra un voto: l'andamento nel tempo, la riga a
 * barra, la card di un numero solo e la variazione fra due prove.
 *
 * Stanno fuori dalle pagine perché le conversazioni e i test tecnici
 * raccontano la stessa cosa con gli stessi disegni, nella dashboard come nel
 * confronto: due grafici che si somigliano ma non sono lo stesso codice
 * finirebbero per divergere alla prima modifica. */

/* ── Grafico a linee: media giornaliera del voto ── */

export function TrendChart({
  points,
  /** Come si chiama un valore nel tooltip, al singolare e al plurale. */
  unit = ['valutazione', 'valutazioni'],
}: {
  points: DayPoint[]
  unit?: [string, string]
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const H = 240
  const M = { left: 34, right: 24, top: 18, bottom: 28 }
  const plotW = Math.max(0, width - M.left - M.right)
  const plotH = H - M.top - M.bottom

  const minT = points.length ? points[0].date.getTime() : 0
  const maxT = points.length ? points[points.length - 1].date.getTime() : 0
  const x = useCallback(
    (t: number) =>
      maxT === minT ? M.left + plotW / 2 : M.left + ((t - minT) / (maxT - minT)) * plotW,
    [minT, maxT, M.left, plotW],
  )
  const y = (v: number) => M.top + (1 - v / 10) * plotH

  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!points.length) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    let nearest = 0
    let best = Infinity
    points.forEach((p, i) => {
      const d = Math.abs(px - x(p.date.getTime()))
      if (d < best) {
        best = d
        nearest = i
      }
    })
    setHoverIdx(nearest)
  }

  // Etichette X: tutte se poche, altrimenti un sottoinsieme uniforme
  const labelStep = points.length > 8 ? Math.ceil(points.length / 6) : 1

  const path = points
    .map(
      (p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.date.getTime()).toFixed(1)} ${y(p.avg).toFixed(1)}`,
    )
    .join(' ')

  const hover = hoverIdx !== null ? points[hoverIdx] : null
  const last = points[points.length - 1]

  return (
    <div ref={containerRef} className="relative w-full">
      {width > 0 && (
        <svg
          width={width}
          height={H}
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverIdx(null)}
        >
          {/* Griglia orizzontale: hairline pieno, recessivo */}
          {[0, 2, 4, 6, 8, 10].map((v) => (
            <g key={v}>
              <line
                x1={M.left}
                y1={y(v)}
                x2={width - M.right}
                y2={y(v)}
                stroke={v === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'}
                strokeWidth="1"
              />
              <text x={M.left - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="#64748b">
                {v}
              </text>
            </g>
          ))}

          {/* Etichette asse X */}
          {points.map((p, i) =>
            i % labelStep === 0 || i === points.length - 1 ? (
              <text
                key={i}
                x={x(p.date.getTime())}
                y={H - 8}
                textAnchor="middle"
                fontSize="10"
                fill="#64748b"
              >
                {formatDay(p.date)}
              </text>
            ) : null,
          )}

          {/* Crosshair */}
          {hover && (
            <line
              x1={x(hover.date.getTime())}
              y1={M.top}
              x2={x(hover.date.getTime())}
              y2={M.top + plotH}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="1"
            />
          )}

          {/* Linea 2px, join arrotondati */}
          {points.length > 1 && (
            <path
              d={path}
              fill="none"
              stroke="#7c3aed"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Marker con anello nel colore della superficie */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={x(p.date.getTime())}
              cy={y(p.avg)}
              r={hoverIdx === i ? 5.5 : 4.5}
              fill="#7c3aed"
              stroke="#0e1422"
              strokeWidth="2"
            />
          ))}

          {/* Etichetta diretta solo sull'ultimo punto (testo in token, non nel colore serie) */}
          {last && hoverIdx === null && (
            <text
              x={x(last.date.getTime())}
              y={y(last.avg) - 12}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="#cbd5e1"
            >
              {formatScore(last.avg)}
            </text>
          )}
        </svg>
      )}

      {/* Tooltip: il valore guida, l'etichetta segue */}
      {hover && width > 0 && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-white/10 bg-gray-950/95 px-3 py-2 shadow-lg"
          style={{
            left: Math.min(Math.max(x(hover.date.getTime()), 70), width - 70),
            top: y(hover.avg) - 12,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-3 rounded bg-violet-500" />
            <span className="text-sm font-bold text-slate-100">{formatScore(hover.avg)}/10</span>
          </div>
          <div className="mt-0.5 text-[0.7rem] text-slate-400">
            {hover.count} {hover.count === 1 ? unit[0] : unit[1]} ·{' '}
            {hover.date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Riga a barra (meter): riempimento = punteggio/10, colore per fascia ── */

export function MeterRow({
  label,
  sub,
  score,
  dimmed = false,
  highlighted = false,
  fullLabel = false,
}: {
  label: string
  sub?: string
  score: number
  dimmed?: boolean
  highlighted?: boolean
  /* Etichetta sempre per intero su una riga (mai troncata): la mette sopra
   * la barra invece che affiancata, così non deve condividere spazio con nulla. */
  fullLabel?: boolean
}) {
  if (fullLabel) {
    return (
      <div
        className={`rounded-lg px-2 py-1.5 transition-opacity ${dimmed ? 'opacity-40' : ''} ${
          highlighted ? 'bg-white/4' : ''
        }`}
      >
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <p className="whitespace-nowrap text-[0.82rem] font-medium text-slate-300">{label}</p>
          <span className={`shrink-0 text-right text-sm font-bold ${scoreTextColor(score)}`}>
            {formatScore(score)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/6">
          <div
            className={`h-full rounded-full transition-all ${scoreBarColor(score)}`}
            style={{ width: `${Math.max(0, Math.min(100, score * 10))}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      className={`grid grid-cols-[minmax(0,200px)_1fr_56px] items-center gap-4 rounded-lg px-2 py-1.5 transition-opacity max-sm:grid-cols-[minmax(0,130px)_1fr_56px] ${
        dimmed ? 'opacity-40' : ''
      } ${highlighted ? 'bg-white/4' : ''}`}
    >
      <div className="min-w-0">
        <Tooltip content={label} truncateOnly>
          <p className="truncate text-[0.82rem] font-medium text-slate-300">{label}</p>
        </Tooltip>
        {sub && <p className="truncate text-[0.68rem] text-slate-500">{sub}</p>}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/6">
        <div
          className={`h-full rounded-full transition-all ${scoreBarColor(score)}`}
          style={{ width: `${Math.max(0, Math.min(100, score * 10))}%` }}
        />
      </div>
      <span className={`text-right text-sm font-bold ${scoreTextColor(score)}`}>
        {formatScore(score)}
      </span>
    </div>
  )
}

/* ── Variazione fra due prove ── */

/** Di quanto è cambiato il voto dalla prova di sinistra a quella di destra. */
export function Delta({ value }: { value: number }) {
  const rounded = Math.round(value * 10) / 10
  const cls =
    rounded > 0
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
      : rounded < 0
        ? 'border-red-500/30 bg-red-500/10 text-red-400'
        : 'border-white/10 bg-white/5 text-slate-500'
  const label =
    rounded > 0
      ? `▲ +${formatScore(rounded)}`
      : rounded < 0
        ? `▼ −${formatScore(Math.abs(rounded))}`
        : '='
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[0.72rem] font-semibold ${cls}`}
    >
      {label}
    </span>
  )
}

/* ── Card KPI ── */

export function KpiCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={cardCls}>
      <p className="mb-2 text-xs font-medium tracking-wide text-slate-500">{label}</p>
      {children}
    </div>
  )
}
