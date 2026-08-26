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

/* Le quattro regole che il server non conosce, nell'ordine in cui vanno dette
 * a chi sta compilando. Il nome o il cognome basta uno dei due: certe schede
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
  if (isExternalImageUrl(form.imageUrl)) {
    return "Il ritratto deve stare sull'applicazione: carica il file invece di incollare un indirizzo."
  }
  return ''
}

/* In quel campo va un percorso di qui, e nient'altro che abbia uno schema
 * davanti.
 *
 * Un ritratto ospitato altrove non si vedrebbe nemmeno, perché la
 * Content-Security-Policy ammette immagini solo dalla propria origine (vedi
 * caddy/Caddyfile), e soprattutto sarebbe una richiesta a un dominio di terzi
 * fatta dal browser di ogni persona che apre la galleria: il suo indirizzo IP
 * consegnato a qualcuno che nessuno ha dichiarato. È la stessa ragione per
 * cui i caratteri dell'app non arrivano più da Google (vedi docs/gdpr.md).
 *
 * Fuori resta anche un'immagine incollata dentro l'indirizzo stesso, che la
 * policy mostrerebbe: è una colonna di testo, e un ritratto ci starebbe
 * dentro per intero. Il file caricato passa invece dal controllo dei byte
 * iniziali del backend, che ammette solo PNG, JPEG e WebP. */
export function isExternalImageUrl(imageUrl: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(imageUrl.trim())
}

/* Se la scheda in mano è diversa da quella con cui il form si è aperto.
 *
 * Risponde a una domanda sola: chiudendo adesso, si perde qualcosa? Qui
 * dentro ci sono una settantina di campi, e una bozza generata è costata una
 * chiamata a un modello, quindi la risposta non può essere «chiudi e poi si
 * vede». La conferma di uscita la fa comparire questo confronto.
 *
 * Campo per campo e non `JSON.stringify` dei due oggetti: quel confronto
 * dipende dall'ordine in cui le chiavi sono finite dentro l'oggetto, che qui
 * cambia a ogni bozza applicata, e direbbe «modificata» per una scheda in cui
 * non è cambiato niente. */
export function avatarFormChanged(a: AvatarFormState, b: AvatarFormState): boolean {
  if (
    a.categoryId !== b.categoryId ||
    a.description !== b.description ||
    a.imageUrl !== b.imageUrl ||
    a.voiceId !== b.voiceId ||
    a.organizationId !== b.organizationId
  ) {
    return true
  }
  // L'unione delle chiavi: una scheda salvata quando i campi erano meno non
  // deve risultare uguale a una in cui quei campi sono stati compilati.
  const keys = new Set([...Object.keys(a.profile), ...Object.keys(b.profile)])
  for (const key of keys) {
    if ((a.profile[key] ?? '') !== (b.profile[key] ?? '')) return true
  }
  return false
}

export interface DraftMerge {
  profile: Record<string, string>
  /** Le chiavi scritte da questa bozza: sono quelle che la prossima potrà sostituire. */
  draftedKeys: string[]
  /** Quanti campi ha riempito, per dirlo a chi ha premuto. */
  written: number
  /** Quanti ne ha lasciati stare perché scritti a mano. */
  kept: number
}

/* Una bozza entra nella scheda senza cancellare il lavoro di nessuno.
 *
 * La regola è una sola: la bozza scrive nei campi vuoti e nei campi che
 * aveva scritto lei, mai in quelli scritti a mano. Le due metà servono a due
 * cose diverse, e senza la seconda la funzionalità avrebbe un vicolo cieco.
 *
 * Senza la prima metà, rigenerare da un caso raccontato meglio non
 * cambierebbe niente: la scheda è già piena della bozza di prima, e chi non
 * è soddisfatto dovrebbe svuotare settanta campi a mano per riprovare.
 * Senza la seconda, una rigenerazione porterebbe via le correzioni appena
 * fatte, cioè la parte per cui esiste la revisione umana.
 *
 * Da qui la memoria di quali chiavi vengono dalla bozza: un campo corretto a
 * mano esce da quell'elenco (lo toglie chi scrive nel campo, vedi
 * AvatarFormModal) e da quel momento è intoccabile. */
export function applyDraft(
  profile: Record<string, string>,
  draft: Record<string, string>,
  draftedKeys: string[],
): DraftMerge {
  const dallaBozza = new Set(draftedKeys)
  const next = { ...profile }
  const written: string[] = []
  let kept = 0

  for (const [key, value] of Object.entries(draft)) {
    const scrittoAMano = Boolean((profile[key] ?? '').trim()) && !dallaBozza.has(key)
    if (scrittoAMano) {
      // Contato solo se la bozza aveva qualcosa da dire su quel campo:
      // "ne ho lasciati stare dodici" deve voler dire dodici proposte
      // scartate, non dodici caselle che la bozza aveva comunque vuote.
      if (value.trim()) kept += 1
      continue
    }
    next[key] = value
    if (value.trim()) written.push(key)
  }

  return { profile: next, draftedKeys: written, written: written.length, kept }
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
