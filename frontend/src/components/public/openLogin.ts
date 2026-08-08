/* L'evento con cui le pagine pubbliche chiedono alla navbar di aprire la
 * modale di accesso.
 *
 * Sta in un file suo e non dentro la pagina che lo usa: la navbar lo ascolta
 * sempre, anche a sessione aperta, e importarlo da una pagina del sito
 * vetrina si sarebbe riportato dietro tutto il sito nel primo file che il
 * browser scarica, cioè esattamente quello che gli import dinamici delle
 * pagine pubbliche servono a evitare. */

export const OPEN_LOGIN_EVENT = 'skilllab:open-login'

export function openLogin() {
  window.dispatchEvent(new CustomEvent(OPEN_LOGIN_EVENT))
}
