/* Il ritratto di un avatar, ridotto prima di partire.
 *
 * Chi carica una foto la prende da dove ce l'ha: quattro megapixel usciti da
 * un telefono, o uno screenshot a schermo intero. Sul server finiva così
 * com'era, e poi veniva servita così com'era a ogni riga della tabella e a
 * ogni bolla della chat, per essere disegnata dentro un tondo da cento pixel.
 *
 * Ridurla qui e non di là non è solo comodità: il file che parte è quello
 * ridotto, quindi si risparmia anche la salita, che è la metà lenta di una
 * connessione d'ufficio. Il limite del server resta dov'è, come rete di
 * sicurezza per quello che non passa da questo modulo.
 *
 * Se qualcosa non funziona (un formato che il browser non sa decodificare, un
 * canvas che non parte) torna indietro il file originale: il ridimensionamento
 * è un'ottimizzazione, e un'ottimizzazione che impedisce di caricare
 * un'immagine ha fatto più danni di quanti ne eviti.
 */

/* Il lato lungo del ritratto salvato. Il posto più grande in cui si vede è la
 * scheda dell'avatar, dove sta in un riquadro da 200px: 512 lo copre con
 * margine su uno schermo a densità doppia, e non un pixel di più. */
const MAX_SIDE = 512

/* WebP: a parità di come si vede pesa fra un terzo e la metà di un JPEG, ed è
 * fra i formati che il caricamento già accetta, quindi non cambia niente per
 * il server. La qualità è alta perché un ritratto sgranato in una scheda si
 * nota, e a questa misura il file resta comunque nell'ordine delle decine di
 * kilobyte. */
const MIME = 'image/webp'
const QUALITY = 0.9

/** Le misure del ritratto ridotto, a proporzioni invariate. */
function scaledSize(width: number, height: number) {
  const side = Math.max(width, height)
  // Un'immagine già piccola non si ingrandisce: si ingrandirebbero i pixel,
  // non il dettaglio, e il file peserebbe di più per vedersi peggio
  if (side <= MAX_SIDE) return { width, height }
  const ratio = MAX_SIDE / side
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) }
}

/** L'immagine decodificata, o null se il browser non ci riesce. */
async function decode(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file)
  } catch {
    return null
  }
}

/**
 * Il ritratto ridotto a 512px di lato lungo e convertito in WebP.
 *
 * Restituisce il file originale quando non c'è niente da guadagnare (immagine
 * già piccola) o quando il browser non sa fare il lavoro: in nessuno dei due
 * casi il caricamento deve fermarsi.
 */
export async function resizeAvatarImage(file: File): Promise<File> {
  const bitmap = await decode(file)
  if (!bitmap) return file

  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height)
    if (width === bitmap.width && height === bitmap.height) return file

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, MIME, QUALITY))
    if (!blob) return file

    /* Il nome cambia estensione perché è cambiato il formato: il server
       riconosce il tipo dai primi byte e non dal nome, ma un ".png" che
       contiene WebP è una bugia che qualcuno prima o poi legge. */
    const name = file.name.replace(/\.[^.]+$/, '') || 'ritratto'
    return new File([blob], `${name}.webp`, { type: MIME })
  } finally {
    // Il bitmap tiene memoria finché non lo si chiude, anche a lavoro finito
    bitmap.close()
  }
}
