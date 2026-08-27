/* L'avviso a scomparsa in alto a destra, per un rinfresco che non è
 * riuscito mentre a schermo c'era già qualcosa.
 *
 * Sono due situazioni diverse e vanno raccontate in due modi: se non c'è
 * niente a schermo la pagina lo dice al posto del contenuto e offre di
 * riprovare (`LoadError`), se il catalogo è già lì da una lettura precedente
 * basta questo, perché quello che si vede resta buono e toglierlo sarebbe
 * peggio del non averlo aggiornato.
 *
 * Il posto fisso in cui compare stava scritto nella galleria degli avatar,
 * ed è lo stesso da cui deve uscire quello del simulatore: due gallerie che
 * mettono l'avviso a due altezze diverse sono un avviso che si sposta
 * cambiando schermata. */

import Toast from './Toast'

export default function StaleDataToast({
  message,
  onClose,
}: {
  message: string
  onClose: () => void
}) {
  return (
    <div className="fixed right-8 top-20 z-[1000] flex flex-col gap-2 max-md:inset-x-4 max-md:top-[4.5rem]">
      <Toast title="Aggiornamento non riuscito" message={message} type="error" onClose={onClose} />
    </div>
  )
}
