/* La guida introduttiva: quale passo si sta leggendo, e cosa succede quando
 * si va avanti, si torna indietro o si chiude.
 *
 * Parte da sola una volta sola per ogni account, al primo ingresso: la data
 * in cui è stata vista sta sul profilo (`tutorial_seen_at`), quindi chi entra
 * da un altro computer non se la ritrova, e chi ripulisce i dati del browser
 * nemmeno. Il super admin non la riceve mai, perché per lui `tutorialSteps`
 * non ha passi.
 *
 * Chiuderla la segna come vista comunque, che si arrivi in fondo o che si
 * chiuda al primo passo: chi la interrompe l'ha vista comparire, e
 * riproporgliela al prossimo ingresso sarebbe insistere. Da lì in poi si
 * riapre a mano dal proprio profilo, e quella riapertura non scrive niente:
 * la data dice quando quell'account ha incontrato la guida, non quante volte
 * l'ha letta.
 *
 * Se segnarla come vista non riesce (la rete che cade proprio lì) la guida si
 * chiude lo stesso e non torna per il resto della sessione, ma al prossimo
 * ingresso ricomparirà: fra il rifiutarsi di chiudere e il ricomparire una
 * volta di troppo, la seconda è la noia minore.
 *
 * Il velo, il ritaglio e il riquadro li disegna `TutorialSpotlight`; cosa
 * dicono i passi sta in `tutorialSteps`. */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useMarkTutorialSeen } from '../hooks/useTutorial'
import { CloseIcon } from './icons'
import PrimaryButton from './PrimaryButton'
import SecondaryButton from './SecondaryButton'
import SimulationProgress from './SimulationProgress'
import TutorialSpotlight from './TutorialSpotlight'
import { OPEN_TUTORIAL_EVENT, setTutorialUserMenu } from './tutorialEvents'
import { tutorialSteps } from './tutorialSteps'

export default function TutorialTour() {
  const { user, updateUser } = useAuth()
  const markSeen = useMarkTutorialSeen()
  const titleId = useId()

  const steps = useMemo(() => tutorialSteps(user), [user])
  /** Il passo che si sta leggendo, oppure null: la guida è chiusa. */
  const [index, setIndex] = useState<number | null>(null)
  /* Partita una volta, in questa sessione non riparte da sola: senza, un
     errore nello scriverla come vista la farebbe ricomparire al primo
     ridisegno, cioè subito. */
  const started = useRef(false)

  useEffect(() => {
    if (started.current || steps.length === 0) return
    if (!user || user.tutorial_seen_at !== null) return
    started.current = true
    setIndex(0)
  }, [steps, user])

  /* La riapertura a mano, dal proprio profilo. Chi la chiede la conosce già,
     quindi riparte dal primo passo come la prima volta. */
  useEffect(() => {
    const reopen = () => {
      if (steps.length > 0) setIndex(0)
    }
    window.addEventListener(OPEN_TUTORIAL_EVENT, reopen)
    return () => window.removeEventListener(OPEN_TUTORIAL_EVENT, reopen)
  }, [steps.length])

  const step = index === null ? null : steps[index]

  /* Il menu del proprio account resta aperto finché la guida parla di una
     voce che sta lì dentro, e si richiude appena si passa oltre. */
  useEffect(() => {
    setTutorialUserMenu(step?.opensUserMenu === true)
  }, [step])

  const close = useCallback(() => {
    setIndex(null)
    setTutorialUserMenu(false)
    if (user && user.tutorial_seen_at === null) {
      /* Il profilo di chi guarda vive nel contesto e non in cache: allinearlo
         qui è ciò che impedisce alla guida di ripartire da sola. */
      markSeen.mutate(undefined, { onSuccess: updateUser })
    }
  }, [user, markSeen, updateUser])

  const back = useCallback(() => {
    setIndex((current) => (current === null || current === 0 ? current : current - 1))
  }, [])

  const forward = useCallback(() => {
    if (index === null) return
    if (index === steps.length - 1) close()
    else setIndex(index + 1)
  }, [index, steps.length, close])

  /* Da tastiera si sfoglia con le frecce e si chiude con Esc, come ci si
     aspetta da qualcosa che copre lo schermo e si legge in sequenza. */
  useEffect(() => {
    if (index === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
      else if (event.key === 'ArrowRight') forward()
      else if (event.key === 'ArrowLeft') back()
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [index, close, forward, back])

  if (index === null || !step) return null

  const { Icon } = step
  const last = index === steps.length - 1

  return (
    <TutorialSpotlight anchor={step.anchor} labelledBy={titleId}>
      <button
        type="button"
        className="absolute right-3 top-3 cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 transition hover:bg-white/8 hover:text-slate-100"
        onClick={close}
        aria-label="Chiudi la guida"
      >
        <CloseIcon size={16} />
      </button>

      <div className="mb-3 flex items-center gap-3 pr-8">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-600/25 bg-violet-600/12 text-violet-300">
          <Icon size={20} />
        </div>
        <h2 id={titleId} className="font-heading text-base font-bold text-slate-100">
          {step.title}
        </h2>
      </div>

      <p className="mb-5 text-[0.85rem] leading-relaxed text-slate-400">{step.body}</p>

      {/* La stessa fila di trattini del simulatore: quanti passi ci sono,
          quanti ne restano, e a quale si è. */}
      <SimulationProgress answered={index} total={steps.length} />

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">
          Passo {index + 1} di {steps.length}
        </span>
        <div className="flex items-center gap-2">
          {index > 0 && <SecondaryButton onClick={back}>Indietro</SecondaryButton>}
          {/* Il fuoco entra qui all'apertura: da tastiera si va avanti
              subito, senza attraversare la pagina che sta sotto al velo. */}
          <PrimaryButton autoFocus onClick={forward}>
            {last ? 'Ho capito' : 'Avanti'}
          </PrimaryButton>
        </div>
      </div>
    </TutorialSpotlight>
  )
}
