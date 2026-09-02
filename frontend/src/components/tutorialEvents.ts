/* I due eventi con cui la guida introduttiva parla con la barra in alto e
 * con la pagina del profilo.
 *
 * Sta in un file suo per la stessa ragione di `openLogin`: chi lo manda non
 * deve importare chi lo ascolta. La pagina del profilo chiede di riaprire la
 * guida senza conoscerla, e la guida chiede alla barra di aprire il menu del
 * proprio account senza toccare lo stato che la barra tiene per sé.
 *
 * Il menu del proprio account va aperto per davvero e non disegnato una
 * seconda volta: le voci di amministrazione stanno lì dentro, e una guida che
 * ne mostrasse una copia insegnerebbe un gesto che poi non si ritrova. */

export const OPEN_TUTORIAL_EVENT = 'skilllab:open-tutorial'

/** Riapre la guida introduttiva dal principio. */
export function openTutorial() {
  window.dispatchEvent(new CustomEvent(OPEN_TUTORIAL_EVENT))
}

export const TUTORIAL_USER_MENU_EVENT = 'skilllab:tutorial-user-menu'

/** Chiede alla barra di tenere aperto (o di richiudere) il menu del proprio
 *  account, mentre la guida parla di una voce che sta lì dentro. */
export function setTutorialUserMenu(open: boolean) {
  window.dispatchEvent(new CustomEvent(TUTORIAL_USER_MENU_EVENT, { detail: { open } }))
}
