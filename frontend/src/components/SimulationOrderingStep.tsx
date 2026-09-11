import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { SimulationQuestion } from '../services/simulations'
import { usePointerDrag } from '../hooks/usePointerDrag'
import { GripIcon } from './icons'
import PrimaryButton from './PrimaryButton'

/* Una domanda di ordinamento: i passi arrivano mescolati e si trascinano
 * nelle posizioni della sequenza.
 *
 * Due zone e non un elenco solo: sopra i passi ancora da collocare, sotto le
 * posizioni numerate che aspettano il loro. Rispondere è portare ogni box
 * dalla prima zona alla seconda, quindi la sequenza che si sta costruendo si
 * legge da sola, e quello che manca si vede senza contarlo: sono i box
 * rimasti sopra. Un elenco unico da riordinare mostrerebbe invece una
 * sequenza completa fin dal primo istante, cioè una risposta già data che
 * nessuno ha dato.
 *
 * **Si trascina, e chi non trascina tocca.** Il gesto principale è prendere
 * un box e portarlo dove va, con il mouse o con un dito (vedi
 * ``usePointerDrag``); un tocco secco sul box lo sceglie e il tocco dopo, su
 * una posizione, ce lo colloca. Il secondo modo non ha comandi propri a
 * schermo ed è quello che tiene la domanda rispondibile dove il
 * trascinamento è scomodo, cioè su uno schermo piccolo e per chi punta con
 * fatica.
 *
 * Una posizione già occupata non respinge il box che arriva: se veniva da
 * un'altra posizione i due si scambiano, se veniva dall'alto l'occupante
 * torna fra quelli da collocare. Rimbalzare sarebbe l'unica mossa che chiede
 * di svuotare prima per poter riempire.
 *
 * **Una sequenza incompleta non è una risposta.** Il server corregge
 * confrontando posizione per posizione e rifiuta un ordine più corto della
 * chiave, quindi finché resta anche un solo box da collocare la domanda
 * viaggia in bianco, e il pulsante lo dice.
 *
 * Senza cronometro, come le risposte aperte e per la stessa ragione: trenta
 * secondi bastano a scegliere una lettera, non a leggere cinque passi e
 * disporli. Qui i punti sono la quota di passi al posto giusto, quindi
 * ricontrollare prima di andare avanti non costa niente ed è anzi la cosa
 * giusta da fare.
 *
 * L'ordine in cui i box arrivano è quello mandato dal server, e non si
 * tocca: rimescolarlo qui vorrebbe dire che ricaricare la pagina cambia la
 * domanda, e la mescolata è già avvenuta una volta, dove la chiave viveva.
 *
 * Come sugli altri passi, nessun riscontro durante il percorso e nessun
 * ritorno indietro: giusto e sbagliato arrivano tutti insieme alla fine. E
 * come là, il componente non sa niente del test: riceve una domanda,
 * raccoglie una risposta e la consegna. */

interface SimulationOrderingStepProps {
  question: SimulationQuestion
  /** La posizione nel test, da 1, come si legge a schermo. */
  number: number
  total: number
  isLast: boolean
  /** La domanda è finita: i passi nell'ordine scelto, o null se la sequenza
   *  non è completa. */
  onAnswer: (steps: string[] | null) => void
}

/** La zona in alto, quella dei passi non ancora collocati. */
const POOL_ZONE = 'pool'

/** Il nome della zona di una posizione, come lo legge `usePointerDrag`. */
const slotZone = (index: number) => `slot-${index}`

export default function SimulationOrderingStep({
  question,
  number,
  total,
  isLast,
  onAnswer,
}: SimulationOrderingStepProps) {
  /* La sequenza in costruzione: una casella per posizione, vuota finché
   * nessun passo ci è stato portato. È l'unico stato della risposta, e i
   * passi ancora da collocare si ricavano da qui invece di essere tenuti a
   * parte: due elenchi da mantenere allineati sarebbero due modi di
   * perdere un passo per strada. */
  const [placed, setPlaced] = useState<(string | null)[]>(() => question.steps.map(() => null))
  /** Il passo scelto con un tocco, che aspetta di sapere dove andare. */
  const [selected, setSelected] = useState<string | null>(null)

  const pool = question.steps.filter((step) => !placed.includes(step))
  const filled = placed.filter((step) => step !== null).length
  const complete = filled === placed.length

  /** Un passo arriva in una zona, trascinato o mandato con un tocco. */
  const drop = (step: string, zone: string) => {
    setSelected(null)
    setPlaced((prev) => {
      const next = [...prev]
      const from = next.indexOf(step)
      if (zone === POOL_ZONE) {
        if (from >= 0) next[from] = null
        return next
      }
      const to = Number(zone.slice('slot-'.length))
      if (!Number.isInteger(to) || to < 0 || to >= next.length) return prev
      if (from === to) return prev
      // La casella di partenza si prende quello che c'era nella casella di
      // arrivo: da un'altra posizione è uno scambio, dall'alto è l'occupante
      // che torna fra quelli da collocare, e in tutti e due i casi nessun
      // passo sparisce.
      if (from >= 0) next[from] = next[to]
      next[to] = step
      return next
    })
  }

  const { drag, startDrag, wasDragged } = usePointerDrag<string>(drop)

  /* Un tocco su un box, che vale come mezzo gesto: `at` è la posizione in cui
   * si trova, `null` se sta ancora fra quelli da collocare.
   *
   * Toccare di nuovo il box già scelto lo riporta in alto se era collocato,
   * e lo lascia andare se era già lassù: è il modo di disfare una mossa
   * senza che ci sia un comando per disfarla. */
  const tap = (step: string, at: number | null) => {
    // Un trascinamento che finisce dov'era cominciato lascia dietro di sé un
    // click, e senza questo il box si ritroverebbe scelto per aver provato a
    // spostarlo.
    if (wasDragged()) return
    if (selected === step) {
      if (at === null) setSelected(null)
      else drop(step, POOL_ZONE)
      return
    }
    if (selected && at !== null) {
      drop(selected, slotZone(at))
      return
    }
    setSelected(step)
  }

  const boxCls = (step: string, active: boolean) => {
    const dragging = drag?.item === step
    return `flex w-full cursor-grab touch-none select-none items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition active:cursor-grabbing ${
      active
        ? 'border-violet-500/60 bg-violet-600/12 text-slate-50'
        : 'border-white/8 bg-white/5 text-slate-100 hover:border-white/16 hover:bg-white/8'
    } ${dragging ? 'opacity-30' : ''}`
  }

  /** Un passo, dovunque si trovi: il gesto che lo prende è sempre lo stesso. */
  const stepBox = (step: string, at: number | null) => (
    <button
      key={step}
      type="button"
      onPointerDown={(event) => startDrag(step, event)}
      onClick={() => tap(step, at)}
      aria-pressed={selected === step}
      aria-label={at === null ? `Passo da collocare: ${step}` : `Posizione ${at + 1}: ${step}`}
      className={boxCls(step, selected === step)}
    >
      <GripIcon size={14} className="shrink-0 text-slate-500" />
      <span className="flex-1 text-[0.92rem] leading-snug">{step}</span>
    </button>
  )

  return (
    <div className="rounded-2xl border border-white/6 bg-gray-900/60 p-6 backdrop-blur-md">
      <div className="mb-4 flex items-center justify-between gap-4">
        <span className="text-xs font-medium tracking-wide text-slate-400">
          Domanda {number} di {total}
        </span>
        <span className="text-xs text-slate-500">
          vale fino a <span className="font-semibold text-slate-400">1</span>
        </span>
      </div>

      <p className="mb-1 text-[1.05rem] font-medium leading-relaxed text-slate-100">
        {question.text}
      </p>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xs text-slate-500">
          Trascina i passi nella sequenza corretta. Il punteggio è proporzionale ai passi collocati
          al posto giusto
        </p>
        {/* Quanti passi sono già a posto, senza contarli a occhio: sta qui e
            non in fondo perché è la stessa informazione del titolo vista
            dall'altra parte, cosa chiede la domanda e quanto ne è stato
            fatto. */}
        <span className="shrink-0 text-xs font-medium text-slate-400">
          {filled} di {placed.length} collocati
        </span>
      </div>

      {/* I passi ancora da collocare, e insieme la zona in cui si riporta
          quello che era stato messo nel posto sbagliato. Non sparisce quando
          si svuota: sparendo, l'unico modo di correggere una sequenza già
          completa sarebbe scambiare due box alla volta. */}
      <div
        data-drop-zone={POOL_ZONE}
        className={`flex flex-col gap-2 rounded-xl border border-dashed p-2.5 transition ${
          drag?.zone === POOL_ZONE
            ? 'border-violet-500/60 bg-violet-600/8'
            : 'border-white/10 bg-white/2'
        }`}
      >
        {pool.length ? (
          pool.map((step) => stepBox(step, null))
        ) : (
          <p className="py-2 text-center text-xs text-slate-500">
            Tutti i passi sono collocati, trascina qui quelli da rivedere
          </p>
        )}
      </div>

      <ol className="mt-4 flex list-none flex-col gap-2">
        {placed.map((step, index) => (
          /* La chiave è la posizione e non il passo: qui la casella resta la
             stessa e cambia quello che contiene, che è l'opposto di un
             elenco riordinato. */
          <li
            key={index}
            data-drop-zone={slotZone(index)}
            className={`flex items-center gap-3 rounded-xl border p-1.5 transition ${
              drag?.zone === slotZone(index)
                ? 'border-violet-500/60 bg-violet-600/8'
                : 'border-transparent'
            }`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-bold transition ${
                step
                  ? 'border-violet-600/30 bg-violet-600/10 text-violet-400'
                  : 'border-white/8 bg-white/4 text-slate-500'
              }`}
            >
              {index + 1}
            </span>
            {step ? (
              stepBox(step, index)
            ) : (
              /* La casella vuota è un bottone e non un riquadro: è dove
                 finisce il passo scelto con un tocco, e da tastiera è l'unico
                 modo di collocarlo. */
              <button
                type="button"
                onClick={() => selected && drop(selected, slotZone(index))}
                aria-label={`Posizione ${index + 1}, vuota`}
                className="w-full rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-left text-[0.85rem] text-slate-600 transition hover:border-white/20 hover:text-slate-500"
              >
                {selected ? 'Colloca qui il passo scelto' : 'Trascina qui un passo'}
              </button>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/6 pt-5">
        <span className="text-xs text-slate-500">
          {selected
            ? placed.includes(selected)
              ? 'Scegli la nuova posizione, o tocca di nuovo il passo per riportarlo in alto'
              : 'Scegli la posizione in cui collocare il passo scelto'
            : complete
              ? 'Proseguendo la sequenza viene confermata e non è più modificabile'
              : filled
                ? 'Una sequenza incompleta non viene valutata: colloca tutti i passi'
                : 'Trascina i passi nelle posizioni, dal primo da eseguire'}
        </span>
        <PrimaryButton onClick={() => onAnswer(complete ? (placed as string[]) : null)}>
          {isLast ? 'Consegna il Test' : complete ? 'Avanti' : 'Salta la Domanda'}
        </PrimaryButton>
      </div>

      {/* Il box che segue il puntatore mentre lo si porta a destinazione.
          Fuori dalla scheda, appeso al body: dentro, il riquadro sfocato del
          test gli farebbe da riferimento e la posizione fissa lo aggancerebbe
          a quello invece che allo schermo. */}
      {drag &&
        createPortal(
          <div
            style={{ left: drag.x, top: drag.y, width: drag.width }}
            className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rotate-1 rounded-xl border border-violet-500/50 bg-gray-900 px-3 py-2.5 text-[0.92rem] leading-snug text-slate-50 shadow-2xl shadow-black/60"
          >
            {drag.item}
          </div>,
          document.body,
        )}
    </div>
  )
}
