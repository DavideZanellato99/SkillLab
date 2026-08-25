/* Gli id con cui una linguetta e il suo contenuto si citano a vicenda.
 *
 * In un file loro e non dentro TabBar perché le usa anche chi rende il
 * pannello, e ricavarle da una radice sola evita che uno dei due nomi resti
 * indietro quando si rinomina l'altro. */

export const tabId = (base: string, value: string) => `${base}-linguetta-${value}`
export const tabPanelId = (base: string, value: string) => `${base}-pannello-${value}`
