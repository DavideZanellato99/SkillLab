/* Avviso di registrazione: chi lo ha già letto, e quando.
 *
 * Una telefonata simulata registra la voce dell'operatore, la trascrive e la
 * fa valutare da un modello, con il punteggio che finisce sotto gli occhi
 * dell'azienda. L'art. 13 vuole che la persona lo sappia PRIMA, non dopo, e
 * "prima" qui vuol dire prima che si apra il microfono.
 *
 * L'avviso completo è bloccante solo la prima volta: la trasparenza continua
 * la portano l'indicatore fisso sotto il pulsante di chiamata e il "REC"
 * durante la conversazione (vedi VoiceButton), che non hanno il difetto di
 * una modale ripetuta, cioè di essere chiusa senza leggerla.
 *
 * Memorizzato per utente, così su una postazione condivisa chi entra dopo
 * riceve comunque il suo avviso. Se il browser viene ripulito l'avviso
 * ricompare: informare una volta di troppo non è un problema, informare una
 * volta di meno sì.
 */

const KEY_PREFIX = 'skilllab.recording-notice.'

/* Lo schermo registrato durante un test è un trattamento diverso dalla voce
 * registrata in una chiamata, con un avviso suo: chi ha letto l'uno non ha
 * letto l'altro, quindi le due chiavi sono distinte. */
const SCREEN_KEY_PREFIX = 'skilllab.screen-recording-notice.'

function key(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

function hasSeen(storageKey: string): boolean {
  try {
    return localStorage.getItem(storageKey) !== null
  } catch {
    // Storage negato (modalità privata, policy del browser): mostriamo
    // l'avviso a ogni chiamata, che è il lato giusto in cui sbagliare.
    return false
  }
}

function remember(storageKey: string): void {
  try {
    localStorage.setItem(storageKey, new Date().toISOString())
  } catch {
    // Vedi sopra: senza storage l'avviso tornerà, e va bene così.
  }
}

/** True se questo utente ha già visto l'avviso su questo browser. */
export function hasSeenRecordingNotice(userId: string): boolean {
  return hasSeen(key(userId))
}

/** Segna l'avviso come letto da questo utente. */
export function rememberRecordingNotice(userId: string): void {
  remember(key(userId))
}

/** True se questo utente ha già letto l'avviso sulla registrazione dello schermo. */
export function hasSeenScreenRecordingNotice(userId: string): boolean {
  return hasSeen(`${SCREEN_KEY_PREFIX}${userId}`)
}

/** Segna l'avviso sulla registrazione dello schermo come letto. */
export function rememberScreenRecordingNotice(userId: string): void {
  remember(`${SCREEN_KEY_PREFIX}${userId}`)
}
