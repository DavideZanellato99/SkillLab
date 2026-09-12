import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/* Trascinare qualcosa da una zona a un'altra, con il mouse o con un dito.
 *
 * Sono gli eventi del puntatore e non il drag and drop del browser: quello
 * nasce per portare roba dentro e fuori dalla finestra, su un telefono non
 * parte affatto, e il fantasma che si porta dietro lo disegna il sistema, con
 * un aspetto diverso su ogni piattaforma. Qui il gesto è lo stesso ovunque,
 * il fantasma lo disegna chi usa l'hook, e non serve nessuna libreria a
 * un'applicazione che dopo il primo deploy non si tocca più.
 *
 * Le zone di rilascio si dichiarano nel DOM con `data-drop-zone="nome"`, e
 * quella sotto il puntatore si ritrova con `elementFromPoint`: chi usa
 * l'hook non registra niente e non tiene nessun elenco, gli basta scrivere
 * l'attributo dove il rilascio ha senso.
 *
 * **Un movimento breve non è un trascinamento.** Finché il puntatore non si è
 * spostato di qualche pixel non succede niente, così un click resta un click:
 * è quello che permette a chi usa l'hook di offrire anche il tocco secco,
 * cioè scegliere l'elemento e poi la sua destinazione, che è il gesto di chi
 * risponde da telefono e di chi non usa il mouse. */

/** Di quanto si deve muovere il puntatore perché sia un trascinamento. */
const DRAG_THRESHOLD_PX = 6

export interface DragState<T> {
  /** Cosa si sta trascinando, così com'è stato passato a `startDrag`. */
  item: T
  /** Dov'è il puntatore adesso. */
  x: number
  y: number
  /** L'angolo in alto a sinistra del fantasma: il punto in cui l'elemento è
   *  stato afferrato resta sotto il puntatore, come se lo si tenesse davvero.
   *  Centrare il fantasma sul puntatore lo portava fuori dallo schermo:
   *  afferrando un box largo quanto la pagina vicino al bordo sinistro, metà
   *  box finiva oltre il bordo. */
  left: number
  top: number
  /** La larghezza di quello che è stato afferrato: il fantasma la eredita,
   *  altrimenti a mezz'aria l'elemento cambierebbe forma. */
  width: number
  /** La zona sotto il puntatore, `null` se non ce n'è nessuna. */
  zone: string | null
}

/** La zona di rilascio sotto un punto dello schermo, se c'è. */
function zoneAt(x: number, y: number): string | null {
  const element = document.elementFromPoint(x, y)
  if (!(element instanceof Element)) return null
  const zone = element.closest<HTMLElement>('[data-drop-zone]')
  return zone?.dataset.dropZone ?? null
}

export function usePointerDrag<T>(onDrop: (item: T, zone: string) => void) {
  /** Il trascinamento in corso, `null` finché la soglia non è superata. */
  const [drag, setDrag] = useState<DragState<T> | null>(null)
  /** Il puntatore è premuto su qualcosa, e potrebbe diventare un click. */
  const [pressed, setPressed] = useState<{
    item: T
    x: number
    y: number
    /** Di quanto il punto afferrato dista dall'angolo dell'elemento. */
    grabX: number
    grabY: number
    width: number
  } | null>(null)

  /* Il rilascio e lo stato corrente letti dai gestori globali, che vivono
   * quanto la pressione e non quanto il render: senza le ref l'ascolto si
   * smonterebbe e rimonterebbe a ogni pixel di movimento. */
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop
  const dragRef = useRef<DragState<T> | null>(null)
  dragRef.current = drag
  /* Il gesto appena finito era un trascinamento. Serve perché un
   * trascinamento che finisce dov'era cominciato è comunque un click per il
   * browser, e chi offre anche il tocco secco lo prenderebbe per tale. */
  const draggedRef = useRef(false)

  useEffect(() => {
    if (!pressed) return

    const move = (event: PointerEvent) => {
      const distance = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y)
      if (!dragRef.current && distance < DRAG_THRESHOLD_PX) return
      draggedRef.current = true
      setDrag({
        item: pressed.item,
        x: event.clientX,
        y: event.clientY,
        left: event.clientX - pressed.grabX,
        top: event.clientY - pressed.grabY,
        width: pressed.width,
        zone: zoneAt(event.clientX, event.clientY),
      })
    }

    /* Fuori da una zona il trascinamento finisce e basta: l'elemento torna
     * dov'era, che è il modo in cui si annulla un gesto cominciato per
     * sbaglio. `pointercancel` arriva quando il sistema si riprende il
     * puntatore, ed è la stessa cosa. */
    const end = () => {
      const dragging = dragRef.current
      if (dragging?.zone) onDropRef.current(dragging.item, dragging.zone)
      setPressed(null)
      setDrag(null)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [pressed])

  /** Il puntatore è appena sceso su qualcosa che si può trascinare. */
  const startDrag = (item: T, event: ReactPointerEvent<HTMLElement>) => {
    // Solo il tasto principale: con il destro si apre il menu contestuale,
    // e restare in ascolto lascerebbe un trascinamento appeso.
    if (event.button !== 0) return
    draggedRef.current = false
    const rect = event.currentTarget.getBoundingClientRect()
    setPressed({
      item,
      x: event.clientX,
      y: event.clientY,
      grabX: event.clientX - rect.left,
      grabY: event.clientY - rect.top,
      width: rect.width,
    })
  }

  /* Il click che sta arrivando è la coda di un trascinamento, e chi lo chiede
   * lo sta scartando: la risposta si consuma, così un click che non viene da
   * nessun puntatore (Invio sulla tastiera) non eredita il gesto di prima. */
  const wasDragged = () => {
    const dragged = draggedRef.current
    draggedRef.current = false
    return dragged
  }

  return { drag, startDrag, wasDragged }
}
