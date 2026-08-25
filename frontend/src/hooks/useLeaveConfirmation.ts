import { useEffect } from 'react'

/**
 * Chiede conferma prima di chiudere o ricaricare la pagina, finché c'è
 * qualcosa che andrebbe perso.
 *
 * Nasce per il test in corso: le risposte date vivono nello stato del
 * componente e non nella cache, perché un test a metà non è un tentativo, e
 * un F5 involontario alla settima domanda rimanda alle regole con le mani
 * vuote. Il browser non lascia scegliere le parole dell'avviso, e va bene
 * così: quello che serve è che ci sia un secondo passaggio.
 *
 * Copre il ricaricare, il chiudere la scheda e l'andare fuori
 * dall'applicazione. **Non copre la navigazione interna**, cioè una voce
 * della barra o il tasto indietro: fermarla vorrebbe dire `useBlocker`, che
 * funziona solo con un data router, e le rotte di questa applicazione stanno
 * su `<BrowserRouter>`.
 */
export function useLeaveConfirmation(active: boolean) {
  useEffect(() => {
    if (!active) return
    const confirmLeave = (event: BeforeUnloadEvent) => {
      // `preventDefault` è quello che chiedono le specifiche di oggi,
      // `returnValue` quello che i browser più vecchi guardano ancora.
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', confirmLeave)
    return () => window.removeEventListener('beforeunload', confirmLeave)
  }, [active])
}
