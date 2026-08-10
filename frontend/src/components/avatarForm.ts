/* La scheda di un avatar mentre la si compila: la forma dei campi del form e
 * i due modi in cui nasce, vuota per un avatar nuovo o letta da uno che
 * esiste già.
 *
 * Sta fuori dal componente perché è la parte che si può verificare senza
 * disegnare niente, ed è anche quella dove un errore costa caro: un campo
 * dimenticato qui è un dato che si perde aprendo una scheda e salvandola. */

import type { AdminAvatar, AdminAvatarPayload } from '../services/admin'
import { emptyProfile } from './avatarProfileConfig'

export interface AvatarFormState {
  /** Una categoria dell'organizzazione scelta qui sotto. */
  categoryId: string
  description: string
  imageUrl: string
  voiceId: string
  /** L'organizzazione proprietaria, obbligatoria. */
  organizationId: string
  profile: Record<string, string>
}

export function emptyAvatarForm(): AvatarFormState {
  return {
    categoryId: '',
    description: '',
    imageUrl: '',
    voiceId: '',
    organizationId: '',
    profile: emptyProfile(),
  }
}

export function avatarFormFrom(avatar: AdminAvatar): AvatarFormState {
  return {
    categoryId: avatar.category_id,
    description: avatar.description ?? '',
    imageUrl: avatar.image_url,
    voiceId: avatar.voice_id ?? '',
    organizationId: avatar.organization_id,
    /* Sopra la scheda vuota, non al suo posto: una scheda salvata quando i
     * campi erano meno non deve arrivare al form con dei buchi. */
    profile: { ...emptyProfile(), ...avatar.profile },
  }
}

/* Le tre regole che il server non conosce, nell'ordine in cui vanno dette a
 * chi sta compilando. Il nome o il cognome basta uno dei due: certe schede
 * sono di un cliente di cui si conosce solo il cognome, e pretenderli
 * entrambi vorrebbe dire farne inventare uno. */
export function avatarFormError(form: AvatarFormState): string {
  if (!form.profile.NOME?.trim() && !form.profile.COGNOME?.trim()) {
    return 'La scheda deve contenere almeno il nome o il cognome del cliente.'
  }
  if (!form.organizationId) {
    return "Seleziona l'organizzazione proprietaria dell'avatar."
  }
  if (!form.categoryId) {
    return "Seleziona la categoria dell'avatar."
  }
  return ''
}

/** Quello che si manda al server: i campi vuoti viaggiano come null. */
export function avatarPayload(form: AvatarFormState): AdminAvatarPayload {
  return {
    category_id: form.categoryId,
    description: form.description.trim() || null,
    image_url: form.imageUrl.trim() || null,
    voice_id: form.voiceId.trim() || null,
    organization_id: form.organizationId,
    profile: form.profile,
  }
}
