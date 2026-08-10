/* Le due misure dei banner di esito, condivise da FormError e FormSuccess.
 *
 * Stanno in un modulo loro e non dentro uno dei due componenti perché sono
 * l'unica cosa che i gemelli hanno in comune, e un file che esporta insieme
 * componenti e valori spegne il fast refresh in sviluppo.
 *
 * Solo margine, spaziatura e corpo del testo: l'allineamento verticale lo
 * decide ogni banner, e due classi `items-*` nella stessa stringa non si
 * risolverebbero nell'ordine in cui sono scritte. */

export type BannerVariant = 'form' | 'page'

/** `form` sta dentro una modale o un form, `page` in cima a una schermata. */
export const bannerSizeCls: Record<BannerVariant, string> = {
  form: 'mb-4 px-4 py-2 text-[0.82rem]',
  page: 'mb-8 px-6 py-4 text-sm',
}

export const bannerBaseCls =
  'flex animate-fade-in-up gap-2 rounded-xl border [animation-duration:0.2s]'
