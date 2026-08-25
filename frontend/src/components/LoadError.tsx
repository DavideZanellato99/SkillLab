import type { BannerVariant } from './bannerStyles'
import FormError from './FormError'
import PrimaryButton from './PrimaryButton'

/* Quello che sta al posto di un contenuto che non è arrivato: perché non c'è,
 * e il comando per richiederlo.
 *
 * Le due cose vanno insieme e non sono un banner qualunque. Un errore di
 * caricamento è l'unico a cui si può rimediare restando dove si è, e senza il
 * comando l'unica via è ricaricare la pagina, che nelle modali vuol dire
 * anche riaprire quello che si stava leggendo.
 *
 * Erano tre copie: la galleria degli avatar aveva già la forma giusta, il
 * dettaglio di una conversazione e la valutazione di una chiamata avevano
 * invece ricopiato a mano il riquadro rosso, la sua icona e il gradiente del
 * bottone, cioè un banner che esiste (`FormError`) e un bottone che esiste
 * (`PrimaryButton`), sessanta righe che si sarebbero scolorite ognuna per
 * conto suo.
 *
 * Non dice "sto riprovando", e non è una dimenticanza: premuto il bottone,
 * TanStack Query riporta la lettura allo stato di attesa e si porta via
 * l'errore, quindi ogni schermata che passa di qui smonta questo riquadro e
 * mette il proprio caricamento. C'era un `isRetrying` che bloccava il bottone
 * durante il tentativo, passato da quattro schermate: in nessuna delle quattro
 * poteva accendersi, perché quando sarebbe servito il riquadro non era più
 * sullo schermo. Chi lo tiene acceso mentre riprova (un errore che non venga
 * da una query) può rimetterlo, ma consapevolmente. */
export default function LoadError({
  message,
  onRetry,
  variant = 'form',
  className = '',
}: {
  message: string
  onRetry: () => void
  /** `form` dentro una modale, `page` la fascia in cima a una schermata. */
  variant?: BannerVariant
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      {/* Dentro una modale il banner prende la larghezza che ha: il messaggio
          è corto e stretto al testo starebbe in mezzo al vuoto, mentre in
          cima a una pagina la fascia è già larga quanto le serve. */}
      <FormError
        variant={variant}
        message={message}
        className={variant === 'form' ? 'w-full' : ''}
      />
      <PrimaryButton onClick={onRetry}>Riprova</PrimaryButton>
    </div>
  )
}
