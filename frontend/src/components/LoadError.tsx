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
 * conto suo. */
export default function LoadError({
  message,
  onRetry,
  isRetrying = false,
  variant = 'form',
  className = '',
}: {
  message: string
  onRetry: () => void
  /** Vero mentre il nuovo tentativo è in corso: il bottone lo dice e si
   *  blocca, o si preme tre volte credendo che non abbia sentito. */
  isRetrying?: boolean
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
      <PrimaryButton onClick={onRetry} disabled={isRetrying}>
        {isRetrying ? 'Nuovo tentativo in corso...' : 'Riprova'}
      </PrimaryButton>
    </div>
  )
}
