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

function key(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

/** True se questo utente ha già visto l'avviso su questo browser. */
export function hasSeenRecordingNotice(userId: string): boolean {
  try {
    return localStorage.getItem(key(userId)) !== null
  } catch {
    // Storage negato (modalità privata, policy del browser): mostriamo
    // l'avviso a ogni chiamata, che è il lato giusto in cui sbagliare.
    return false
  }
}

/** Segna l'avviso come letto da questo utente. */
export function rememberRecordingNotice(userId: string): void {
  try {
    localStorage.setItem(key(userId), new Date().toISOString())
  } catch {
    // Vedi sopra: senza storage l'avviso tornerà, e va bene così.
  }
}
