import { describe, expect, it } from 'vitest'

import type { AdminAvatar } from '../../src/services/admin'
import {
  applyDraft,
  avatarFormError,
  avatarFormFrom,
  avatarPayload,
  emptyAvatarForm,
  isExternalImageUrl,
} from '../../src/components/avatarForm'
import { emptyProfile } from '../../src/components/avatarProfileConfig'

/* Le regole della scheda che il server non conosce, e il viaggio andata e
 * ritorno fra un avatar salvato e il form che lo modifica.
 *
 * Sono la parte in cui un errore si paga caro e in silenzio: un campo che
 * non viene letto all'apertura è un dato che sparisce al primo salvataggio,
 * e nessuno se ne accorge finché non riapre quella scheda. */

function avatar(over: Partial<AdminAvatar> = {}): AdminAvatar {
  return {
    id: 'av-1',
    name: 'Mario Rossi',
    image_url: '/static/avatars/mario.png',
    category: 'clienti',
    category_id: 'cat-1',
    category_color: 'orange',
    description: 'Cliente irritato',
    voice_id: 'voce-1',
    organization_id: 'org-1',
    organization_name: 'Banca Esempio',
    conversation_count: 3,
    deleted_at: null,
    profile: { NOME: 'Mario', COGNOME: 'Rossi' },
    created_at: '2026-01-01T10:00:00Z',
    created_by_email: 'sistema',
    updated_at: '2026-01-01T10:00:00Z',
    updated_by_email: 'sistema',
    ...over,
  } as AdminAvatar
}

describe('avatarFormError', () => {
  it('accetta una scheda con il solo cognome', () => {
    // Di certi clienti si conosce solo il cognome: pretenderli entrambi
    // vorrebbe dire farne inventare uno
    const form = {
      ...emptyAvatarForm(),
      organizationId: 'org-1',
      categoryId: 'cat-1',
      profile: { ...emptyAvatarForm().profile, COGNOME: 'Rossi' },
    }
    expect(avatarFormError(form)).toBe('')
  })

  it('rifiuta una scheda senza né nome né cognome', () => {
    const form = { ...emptyAvatarForm(), organizationId: 'org-1', categoryId: 'cat-1' }
    expect(avatarFormError(form)).toContain('almeno il nome o il cognome')
  })

  it('non considera un nome fatto di soli spazi', () => {
    const form = {
      ...emptyAvatarForm(),
      organizationId: 'org-1',
      categoryId: 'cat-1',
      profile: { ...emptyAvatarForm().profile, NOME: '   ' },
    }
    expect(avatarFormError(form)).toContain('almeno il nome o il cognome')
  })

  it("chiede l'organizzazione prima della categoria", () => {
    // L'ordine conta: la categoria si sceglie fra quelle dell'organizzazione,
    // quindi chiederla per prima manderebbe su una tendina vuota
    const form = {
      ...emptyAvatarForm(),
      profile: { ...emptyAvatarForm().profile, NOME: 'Mario' },
    }
    expect(avatarFormError(form)).toContain("l'organizzazione")
  })

  it('chiede la categoria quando manca solo quella', () => {
    const form = {
      ...emptyAvatarForm(),
      organizationId: 'org-1',
      profile: { ...emptyAvatarForm().profile, NOME: 'Mario' },
    }
    expect(avatarFormError(form)).toContain('la categoria')
  })
})

describe('avatarFormFrom', () => {
  it("porta nel form tutto quello che l'avatar ha", () => {
    const form = avatarFormFrom(avatar())
    expect(form).toMatchObject({
      categoryId: 'cat-1',
      description: 'Cliente irritato',
      imageUrl: '/static/avatars/mario.png',
      voiceId: 'voce-1',
      organizationId: 'org-1',
    })
    expect(form.profile.NOME).toBe('Mario')
  })

  it('trasforma i campi assenti in stringhe vuote, non in "null"', () => {
    // Il form scrive dentro gli input: un null ci finirebbe scritto
    const form = avatarFormFrom(avatar({ description: null, voice_id: null }))
    expect(form.description).toBe('')
    expect(form.voiceId).toBe('')
  })

  it('completa una scheda salvata quando i campi erano meno', () => {
    const form = avatarFormFrom(avatar({ profile: { NOME: 'Mario' } }))
    // Gli altri campi ci sono e sono vuoti, non mancanti
    expect(form.profile).toHaveProperty('COGNOME', '')
    expect(Object.keys(form.profile).length).toBeGreaterThan(1)
  })
})

/* Un ritratto ospitato altrove non si vedrebbe (la CSP ammette immagini solo
 * dalla propria origine) e sarebbe una richiesta a un dominio di terzi fatta
 * dal browser di chiunque apra la galleria. */
describe('il ritratto sta sulla propria origine', () => {
  const conRitratto = (imageUrl: string) => ({
    ...emptyAvatarForm(),
    organizationId: 'org-1',
    categoryId: 'cat-1',
    profile: { ...emptyAvatarForm().profile, COGNOME: 'Rossi' },
    imageUrl,
  })

  it('rifiuta un indirizzo esterno, dicendo cosa fare al suo posto', () => {
    expect(avatarFormError(conRitratto('https://cdn.esempio.it/mario.png'))).toContain(
      'carica il file',
    )
  })

  it('rifiuta qualunque schema, non solo http', () => {
    expect(isExternalImageUrl('data:image/png;base64,AAA')).toBe(true)
    expect(isExternalImageUrl('  HTTPS://cdn.esempio.it/x.png  ')).toBe(true)
  })

  it('lascia passare un percorso di qui', () => {
    expect(avatarFormError(conRitratto('/static/avatars/mario.png'))).toBe('')
    expect(avatarFormError(conRitratto(''))).toBe('')
  })

  /* Il confine è lo schema dell'indirizzo, non la parola "http": un file che
   * si chiama così non ha niente che non va. */
  it('non si fa ingannare da un nome di file che comincia per http', () => {
    expect(isExternalImageUrl('/static/avatars/https-mario.png')).toBe(false)
  })
})

/* La bozza del modello entra nella scheda con una regola sola: scrive nei
 * campi vuoti e in quelli che aveva scritto lei, mai in quelli scritti a
 * mano. Le due metà servono a due cose diverse, ed è la parte di questa
 * funzionalità in cui un errore si porta via il lavoro di una persona. */
describe('applyDraft', () => {
  const bozza = {
    NOME: 'Mario',
    COGNOME: 'Rossi',
    TIPO_SCENARIO: 'Vede due addebiti uguali',
    PAURE: '',
  }

  it('riempie una scheda vuota', () => {
    const esito = applyDraft(emptyProfile(), bozza, [])

    expect(esito.profile.NOME).toBe('Mario')
    expect(esito.written).toBe(3)
    expect(esito.kept).toBe(0)
    expect(esito.draftedKeys).toEqual(['NOME', 'COGNOME', 'TIPO_SCENARIO'])
  })

  it('non tocca quello che ha scritto una persona', () => {
    const scritto = { ...emptyProfile(), NOME: 'Giovanni' }

    const esito = applyDraft(scritto, bozza, [])

    expect(esito.profile.NOME).toBe('Giovanni')
    expect(esito.profile.COGNOME).toBe('Rossi')
    expect(esito.kept).toBe(1)
  })

  /* Senza questo, rigenerare da un caso raccontato meglio non cambierebbe
   * niente: la scheda è già piena della bozza di prima. */
  it('sostituisce quello che aveva scritto la bozza precedente', () => {
    const primaBozza = applyDraft(emptyProfile(), bozza, [])

    const seconda = applyDraft(
      primaBozza.profile,
      { ...bozza, NOME: 'Luca' },
      primaBozza.draftedKeys,
    )

    expect(seconda.profile.NOME).toBe('Luca')
    expect(seconda.kept).toBe(0)
  })

  /* E senza questo, una rigenerazione porterebbe via le correzioni appena
   * fatte, cioè la parte per cui esiste la revisione umana. Il campo
   * corretto esce dall'elenco di quelli della bozza quando lo si tocca (lo
   * fa il form), e da lì in poi è intoccabile. */
  it('smette di toccare un campo della bozza appena viene corretto', () => {
    const primaBozza = applyDraft(emptyProfile(), bozza, [])
    const corretto = { ...primaBozza.profile, NOME: 'Giovanni' }
    const ancoraDallaBozza = primaBozza.draftedKeys.filter((k) => k !== 'NOME')

    const seconda = applyDraft(corretto, { ...bozza, NOME: 'Luca' }, ancoraDallaBozza)

    expect(seconda.profile.NOME).toBe('Giovanni')
    expect(seconda.kept).toBe(1)
  })

  /* "Ne ho lasciati stare dodici" deve voler dire dodici proposte scartate,
   * non dodici caselle che la bozza aveva comunque vuote. */
  it('non conta come lasciato stare un campo su cui la bozza non aveva niente da dire', () => {
    const scritto = { ...emptyProfile(), PAURE: 'Perdere il lavoro' }

    const esito = applyDraft(scritto, bozza, [])

    expect(esito.profile.PAURE).toBe('Perdere il lavoro')
    expect(esito.kept).toBe(0)
  })

  it('lascia stare i campi di cui la bozza non parla affatto', () => {
    const scritto = { ...emptyProfile(), SEGRETI: 'Sta per cambiare banca' }

    const esito = applyDraft(scritto, bozza, [])

    expect(esito.profile.SEGRETI).toBe('Sta per cambiare banca')
  })
})

describe('avatarPayload', () => {
  it('manda null e non stringhe vuote per i campi lasciati in bianco', () => {
    const payload = avatarPayload({
      ...emptyAvatarForm(),
      organizationId: 'org-1',
      categoryId: 'cat-1',
    })
    expect(payload.description).toBeNull()
    expect(payload.image_url).toBeNull()
    expect(payload.voice_id).toBeNull()
  })

  it('toglie gli spazi attorno ai valori scritti a mano', () => {
    const payload = avatarPayload({
      ...emptyAvatarForm(),
      organizationId: 'org-1',
      categoryId: 'cat-1',
      voiceId: '  voce-1  ',
      description: '  Cliente irritato  ',
    })
    expect(payload.voice_id).toBe('voce-1')
    expect(payload.description).toBe('Cliente irritato')
  })
})
