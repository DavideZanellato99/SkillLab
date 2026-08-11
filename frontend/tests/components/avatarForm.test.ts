import { describe, expect, it } from 'vitest'

import type { AdminAvatar } from '../../src/services/admin'
import {
  avatarFormError,
  avatarFormFrom,
  avatarPayload,
  emptyAvatarForm,
} from '../../src/components/avatarForm'

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
    difficulty: '7/10',
    voice_id: 'voce-1',
    organization_id: 'org-1',
    organization_name: 'Banca Esempio',
    conversation_count: 3,
    deleted_at: null,
    profile: { NOME: 'Mario', COGNOME: 'Rossi', GRADO_DIFFICOLTA: '7/10' },
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
