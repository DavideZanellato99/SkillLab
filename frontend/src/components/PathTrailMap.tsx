import { useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { AssignmentStatus, StepProgress } from '../services/training'
import { STATUS_META } from './assignmentStatus'
import Tooltip from './Tooltip'
import {
  ChatIcon,
  CheckIcon,
  ChecklistIcon,
  LockIcon,
  MinusIcon,
  PlusIcon,
  TargetIcon,
} from './icons'
import {
  ACTIVE_NODE_SIZE,
  NODE_SIZE,
  TRAIL_STROKE,
  ZOOM_LEVELS,
  ZOOM_WITH_LABELS,
  litUntil,
  trailHeight,
  trailNodes,
  trailPath,
} from './pathMapLayout'
import { currentStepOf, isStepLocked, stepKindLabel, stepTarget } from './trainingFormat'

/* Il percorso disegnato come un sentiero da percorrere con lo sguardo: le
 * tappe sono nodi su una linea che scende serpeggiando, il tratto già
 * camminato è acceso, e dentro la mappa ci si muove.
 *
 * È la stessa regola che racconta PathStepsTrail, cioè che si va avanti una
 * tappa per volta, detta a chi il percorso lo sta facendo invece che a chi lo
 * governa. La fila di righe va bene per leggere venti assegnazioni in una
 * tabella; qui la domanda è una sola e diversa, «a che punto sono io», e la
 * risposta è dove finisce la luce.
 *
 * **La mappa ha una finestra sua**, e non è la pagina. Un percorso lungo
 * disteso per intero costringe a scorrere tutto lo schermo per sapere cosa
 * viene fra sei tappe, e portarsi via il pannello della tappa scelta mentre
 * lo si fa: qui il sentiero scorre dentro il proprio riquadro, si trascina
 * col mouse, e la riduzione lo accorcia fino a farlo stare tutto sotto gli
 * occhi. Guardare avanti è un gesto, non un viaggio, e da qualunque punto si
 * torna a dove si è con un bottone solo.
 *
 * La riduzione è un conto rifatto e non un `transform` (vedi pathMapLayout):
 * un disegno rimpicciolito avrebbe portato con sé i nomi, illeggibili, e le
 * posizioni non sarebbero più state quelle da cui si centra una tappa.
 *
 * Il tracciato è un SVG steso sotto ai nodi, che invece sono bottoni veri:
 * disegnare anche i cerchi dentro l'SVG avrebbe voluto dire rifare a mano il
 * fuoco da tastiera, il testo che si tronca e il tooltip. Il viewBox non
 * conserva le proporzioni, perché la `x` dei nodi è una percentuale e la `y`
 * dei pixel; a tenere il tratto della stessa grossezza malgrado lo stiramento
 * è `vector-effect`.
 *
 * Quello stiramento è anche il motivo per cui **la parte accesa è ritagliata
 * da una maschera e non da un tratteggio**: le lunghezze lungo una curva
 * cambiano di misura fra il disegno e lo schermo, e con `pathLength` a fare da
 * mediatore il fondo del sentiero risultava acceso a percorso appena
 * cominciato. Un taglio orizzontale non ha questo problema.
 *
 * Anche una tappa bloccata si può scegliere: guardarne l'obiettivo è come
 * sapere cosa viene dopo, che è metà del motivo per cui un percorso è una
 * fila. Quello che non fa è portarci dentro. */

const NODE_STYLES: Record<AssignmentStatus, string> = {
  locked: 'border-white/10 bg-white/4 text-slate-600',
  active:
    'border-transparent bg-gradient-to-br from-violet-600 to-cyan-500 text-white shadow-[0_8px_28px_rgba(124,58,237,0.45)]',
  overdue: 'border-red-500/50 bg-red-500/15 text-red-300 shadow-[0_8px_24px_rgba(239,68,68,0.2)]',
  completed: 'border-emerald-500/50 bg-emerald-500/12 text-emerald-300',
  completed_late: 'border-orange-500/50 bg-orange-500/12 text-orange-300',
}

const controlCls =
  'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-gray-900/80 text-slate-300 backdrop-blur-md transition hover:border-violet-600/40 hover:bg-gray-900 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/10 disabled:hover:bg-gray-900/80'

/** Oltre questo spostamento il gesto era un trascinamento, non un clic. */
const DRAG_SLOP = 4

function NodeFace({ step, scale }: { step: StepProgress; scale: number }) {
  if (step.status === 'completed' || step.status === 'completed_late') {
    return <CheckIcon size={Math.round(24 * scale)} />
  }
  // Il lucchetto lo decide lo sblocco e non lo stato: una tappa chiusa la cui
  // data è passata risponde "overdue", e il nodo la tinge di rosso, ma resta
  // una tappa che non si può ancora cominciare.
  if (isStepLocked(step)) return <LockIcon size={Math.round(20 * scale)} />
  return (
    <span
      className="font-heading font-bold tabular-nums"
      style={{ fontSize: `${1.25 * scale}rem` }}
    >
      {step.position}
    </span>
  )
}

export default function PathTrailMap({
  steps,
  completedSteps,
  selectedId,
  onSelect,
}: {
  steps: StepProgress[]
  /** Quante tappe sono chiuse: è fin lì che il sentiero è acceso. */
  completedSteps: number
  selectedId: string
  onSelect: (stepId: string) => void
}) {
  const [zoomIndex, setZoomIndex] = useState(ZOOM_LEVELS.length - 1)
  const [shade, setShade] = useState({ top: false, bottom: false })
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragged = useRef(false)
  const centered = useRef(false)
  const shownAt = useRef(zoomIndex)

  const zoom = ZOOM_LEVELS[zoomIndex]
  const nodes = trailNodes(steps.length, zoom)
  const height = trailHeight(steps.length, zoom)
  const litY = litUntil(nodes, completedSteps)
  const withLabels = zoom >= ZOOM_WITH_LABELS
  const currentId = currentStepOf(steps)?.id

  const scrollToStep = (stepId: string | undefined, behavior: ScrollBehavior) => {
    const viewport = viewportRef.current
    const index = steps.findIndex((step) => step.id === stepId)
    if (!viewport || index < 0) return
    viewport.scrollTo({ top: nodes[index].y - viewport.clientHeight / 2, behavior })
  }

  /* Due volte la finestra si sposta da sola, e tutte e due prima che il
     disegno appaia, perché uno scatto dopo si vedrebbe.
     All'apertura si porta sulla tappa in cui ci si trova: è lì che la pagina
     risponde alla domanda con cui la si è aperta, e su un percorso lungo quel
     punto sarebbe fuori dallo schermo. Cambiando riduzione tiene ferma la
     tappa scelta, perché rimpicciolire serve a vedere cosa le sta attorno,
     non a perderla di vista, e se non ce n'è nessuna aperta torna a quella di
     adesso, che è il punto attorno a cui si guarda quando non si sta
     guardando niente in particolare. Il resto del tempo è chi guarda a
     decidere dove stare, e la mappa non gli toglie il posto. */
  useLayoutEffect(() => {
    if (!centered.current) {
      centered.current = true
      shownAt.current = zoomIndex
      scrollToStep(selectedId || currentId, 'instant')
    } else if (shownAt.current !== zoomIndex) {
      shownAt.current = zoomIndex
      scrollToStep(selectedId || currentId, 'instant')
    } else {
      return
    }
    handleScroll()
  })

  const handleScroll = () => {
    const viewport = viewportRef.current
    if (!viewport) return
    setShade({
      top: viewport.scrollTop > 8,
      bottom: viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 8,
    })
  }

  /* Il trascinamento è solo del mouse: al dito il riquadro risponde già da
     sé, e intercettarlo vorrebbe dire rifare peggio lo scorrimento che il
     browser fa da solo. */
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    if (!viewport || event.pointerType !== 'mouse') return
    dragged.current = false
    const startY = event.clientY
    const startTop = viewport.scrollTop

    const move = (e: PointerEvent) => {
      if (Math.abs(e.clientY - startY) > DRAG_SLOP) dragged.current = true
      viewport.scrollTop = startTop - (e.clientY - startY)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="relative">
      <div className="absolute right-3 top-3 z-20 flex flex-col gap-1.5">
        <Tooltip content="Ingrandisci" side="bottom">
          <button
            type="button"
            className={controlCls}
            onClick={() => setZoomIndex(zoomIndex + 1)}
            disabled={zoomIndex >= ZOOM_LEVELS.length - 1}
            aria-label="Ingrandisci la mappa"
          >
            <PlusIcon size={15} />
          </button>
        </Tooltip>
        <Tooltip content="Rimpicciolisci, per vedere più tappe" side="bottom">
          <button
            type="button"
            className={controlCls}
            onClick={() => setZoomIndex(zoomIndex - 1)}
            disabled={zoomIndex <= 0}
            aria-label="Rimpicciolisci la mappa"
          >
            <MinusIcon size={15} />
          </button>
        </Tooltip>
        <Tooltip content="Torna alla tappa di adesso" side="bottom">
          <button
            type="button"
            className={controlCls}
            onClick={() => scrollToStep(currentId, 'smooth')}
            aria-label="Torna alla tappa di adesso"
          >
            <TargetIcon size={15} />
          </button>
        </Tooltip>
      </div>

      {/* Le sfumature ai bordi dicono che la mappa continua di là: senza, il
          taglio del riquadro sembrerebbe la fine del percorso. */}
      {shade.top && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-gradient-to-b from-gray-950/80 to-transparent" />
      )}
      {shade.bottom && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-12 bg-gradient-to-t from-gray-950/80 to-transparent" />
      )}

      <div
        ref={viewportRef}
        role="region"
        aria-label="Mappa del percorso"
        tabIndex={0}
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        className="relative max-h-[68vh] cursor-grab overflow-y-auto overscroll-contain outline-none active:cursor-grabbing focus-visible:ring-1 focus-visible:ring-violet-500/40"
        style={{ height }}
      >
        <div className="relative w-full" style={{ height }}>
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 100 ${height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id="trail-lit"
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1="0"
                x2="0"
                y2={height}
              >
                <stop offset="0%" stopColor="#7c3aed" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
              {/* La luce si ferma dove dice la maschera, e la maschera è un
                  taglio orizzontale: il sentiero scende sempre, quindi «fin
                  dove sono arrivato» è un'altezza, che lo stiramento in
                  larghezza non tocca (vedi litUntil). */}
              <clipPath id="trail-walked">
                <rect
                  x="0"
                  y="0"
                  width="100"
                  height={litY}
                  className="transition-all duration-1000 ease-out"
                />
              </clipPath>
            </defs>
            {/* Il sentiero intero, appena accennato: è una strada, quindi una
                linea piena. Tratteggiarlo per dire «qui non sei ancora
                passato» non funziona a questa grossezza, perché con le
                estremità tonde ogni trattino diventa una perlina e la strada
                si sgrana in una collana di pallini. A dire cosa è fatto e cosa
                no basta la luce che ci passa sopra. */}
            <path
              d={trailPath(nodes)}
              fill="none"
              stroke="rgba(255,255,255,0.09)"
              strokeWidth={TRAIL_STROKE * zoom}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {/* La stessa strada ripassata con la luce, fin dove si è arrivati:
                a stabilire dove finire è la maschera qui sopra. */}
            {litY > 0 && (
              <path
                d={trailPath(nodes)}
                fill="none"
                stroke="url(#trail-lit)"
                strokeWidth={TRAIL_STROKE * zoom}
                strokeLinecap="round"
                clipPath="url(#trail-walked)"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* L'elenco sta steso sopra al tracciato e non attorno: le tappe
              sono posizionate una per una, e le serve un riquadro che copra
              esattamente la mappa da cui misurarsi. */}
          <ol className="absolute inset-0">
            {steps.map((step, i) => {
              const selected = step.id === selectedId
              const isActive = step.status === 'active'
              const locked = isStepLocked(step)
              const size = Math.round((isActive ? ACTIVE_NODE_SIZE : NODE_SIZE) * zoom)
              const badge = Math.round(24 * zoom)

              return (
                <li
                  key={step.id}
                  className="absolute"
                  style={{
                    left: `${nodes[i].x}%`,
                    top: nodes[i].y,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  {/* L'alone della tappa aperta: è l'unico punto della mappa
                      che si muove, ed è quello in cui ci si trova adesso. */}
                  {isActive && (
                    <span className="pointer-events-none absolute -inset-3 animate-glow-pulse rounded-full bg-violet-600/30 blur-lg" />
                  )}
                  <Tooltip
                    content={
                      locked
                        ? 'Si sblocca superando la tappa precedente'
                        : withLabels
                          ? ''
                          : `Tappa ${step.position} · ${stepTarget(step)}`
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (dragged.current) return
                        onSelect(step.id)
                      }}
                      aria-pressed={selected}
                      aria-label={`Tappa ${step.position}, ${stepTarget(step)}, ${
                        STATUS_META[step.status].label
                      }`}
                      style={{ width: size, height: size }}
                      className={`relative flex items-center justify-center rounded-full border-2 backdrop-blur-md transition duration-300 hover:scale-110 ${
                        NODE_STYLES[step.status]
                      } ${
                        selected ? 'ring-2 ring-violet-400/70 ring-offset-4 ring-offset-night' : ''
                      } ${locked ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      <NodeFace step={step} scale={zoom} />
                      {/* Di che prova si tratta, appeso al nodo: sulla mappa
                          il nome della tappa da solo non dice se si parla o
                          si risponde. */}
                      <span
                        className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full border border-white/10 bg-night text-slate-400"
                        style={{ width: badge, height: badge }}
                      >
                        {step.kind === 'avatar' ? (
                          <ChatIcon size={Math.round(12 * zoom)} />
                        ) : (
                          <ChecklistIcon size={Math.round(12 * zoom)} />
                        )}
                      </span>
                      {withLabels && (
                        <span className="pointer-events-none absolute left-1/2 top-full mt-3 w-28 -translate-x-1/2 text-center sm:w-40">
                          <span
                            className={`block truncate text-[0.82rem] font-semibold ${
                              locked ? 'text-slate-500' : 'text-slate-100'
                            }`}
                          >
                            {stepTarget(step)}
                          </span>
                          <span className="block text-[0.68rem] text-slate-500">
                            {stepKindLabel(step)}
                          </span>
                        </span>
                      )}
                    </button>
                  </Tooltip>
                </li>
              )
            })}
          </ol>
        </div>
      </div>

      {/* Detto solo quando c'è davvero dell'altro fuori dal riquadro: su un
          percorso corto la mappa sta tutta lì, e un invito a spostarsi
          sarebbe un invito a cercare qualcosa che non c'è. */}
      {(shade.top || shade.bottom) && (
        <p className="mt-2 text-center text-[0.7rem] text-slate-600">
          Trascina la mappa per spostarti lungo il percorso
        </p>
      )}
    </div>
  )
}
