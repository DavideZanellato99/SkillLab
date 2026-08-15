import { beforeEach, describe, expect, it, vi } from 'vitest'

/* Involucri attorno ad apiFetch: quello che conta è l'indirizzo, il verbo e
 * come i filtri diventano parametri, cioè le uniche cose che possono
 * divergere in silenzio dal backend. */
const apiFetch = vi.hoisted(() => vi.fn())
const apiFetchBlob = vi.hoisted(() => vi.fn())
vi.mock('../../src/services/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  apiFetchBlob: (...args: unknown[]) => apiFetchBlob(...args),
}))

import {
  createAvatar,
  createAvatarCategory,
  createNewUser,
  deleteAdminConversation,
  deleteAvatar,
  deleteAvatarCategory,
  deleteConversationReview,
  deleteMessageAnnotation,
  deleteUser,
  fetchAdminAvatars,
  fetchAdminConversation,
  fetchAdminEvaluationPdf,
  fetchAvatarCategories,
  fetchEvaluationsReport,
  fetchEvaluationsReportXlsx,
  fetchSimulationsReport,
  fetchUserDebriefing,
  fetchUsers,
  fetchUsersReport,
  fetchVoicePreview,
  fetchVoices,
  generateUserDebriefing,
  previewPersonaPrompt,
  resendUserCredentials,
  restoreAvatar,
  saveConversationReview,
  saveMessageAnnotation,
  setUserStatus,
  updateAvatar,
  updateAvatarCategory,
  updateUser,
  uploadAvatarImage,
} from '../../src/services/admin'

function ultimaChiamata(mock = apiFetch) {
  const [endpoint, options] = mock.mock.calls.at(-1) as [string, Record<string, unknown>?]
  return { endpoint, options: options ?? {} }
}

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue({})
  apiFetchBlob.mockReset()
  apiFetchBlob.mockResolvedValue(new Blob())
})

describe('elenco utenti', () => {
  it('senza filtri chiede la finestra predefinita', async () => {
    await fetchUsers()
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/users',
      options: { params: {} },
    })
  })

  it('traduce ogni filtro nel nome che usa il server', async () => {
    await fetchUsers({
      organizationId: 'org-1',
      ruolo: 'user',
      status: 'active',
      search: 'anna',
      limit: 50,
      offset: 100,
    })

    expect(ultimaChiamata().options.params).toEqual({
      organization_id: 'org-1',
      ruolo: 'user',
      status: 'active',
      q: 'anna',
      limit: '50',
      offset: '100',
    })
  })

  /* "Mai entrato" è un filtro a due valori, e `false` ne è uno: trattarlo
   * come non impostato renderebbe impossibile chiedere chi è già entrato. */
  it('manda il filtro "mai entrato" anche quando vale falso', async () => {
    await fetchUsers({ neverLoggedIn: false })
    expect(ultimaChiamata().options.params).toEqual({ never_logged_in: 'false' })
  })

  it('manda limite e scarto anche quando valgono zero', async () => {
    await fetchUsers({ limit: 0, offset: 0 })
    expect(ultimaChiamata().options.params).toEqual({ limit: '0', offset: '0' })
  })

  it('lascia fuori i filtri lasciati in bianco', async () => {
    await fetchUsers({ search: '', organizationId: '' })
    expect(ultimaChiamata().options.params).toEqual({})
  })
})

describe('scritture su un account', () => {
  it('crea un utente', async () => {
    const payload = {
      email: 'anna@test.it',
      nome: 'Anna',
      cognome: 'Rossi',
      ruolo: 'user' as const,
    }
    await createNewUser(payload)
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/users',
      options: { method: 'POST', body: payload },
    })
  })

  it('modifica un utente', async () => {
    await updateUser('u-1', { nome: 'Anna' })
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/users/u-1',
      options: { method: 'PUT', body: { nome: 'Anna' } },
    })
  })

  it('elimina un utente', async () => {
    await deleteUser('u-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/users/u-1',
      options: { method: 'DELETE' },
    })
  })

  it('cambia lo stato di un account da un indirizzo dedicato', async () => {
    await setUserStatus('u-1', 'suspended')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/users/u-1/status',
      options: { method: 'PUT', body: { status: 'suspended' } },
    })
  })

  it('rimanda le credenziali', async () => {
    await resendUserCredentials('u-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/users/u-1/resend-credentials',
      options: { method: 'POST' },
    })
  })
})

describe('avatar', () => {
  it('legge il catalogo senza gli archiviati', async () => {
    await fetchAdminAvatars()
    expect(ultimaChiamata().endpoint).toBe('/api/admin/avatars')
  })

  it('legge il catalogo con gli archiviati quando li si chiede', async () => {
    await fetchAdminAvatars(true)
    expect(ultimaChiamata().endpoint).toBe('/api/admin/avatars?include_deleted=true')
  })

  it('crea e modifica un avatar', async () => {
    const payload = { name: 'Cliente', image_url: '/x.png', organization_id: 'org-1', profile: {} }
    await createAvatar(payload as never)
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/avatars',
      options: { method: 'POST', body: payload },
    })

    await updateAvatar('a-1', payload as never)
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/avatars/a-1',
      options: { method: 'PUT', body: payload },
    })
  })

  /* Archiviare è un'eliminazione logica e riportarlo in catalogo è una
   * scrittura a sé: le conversazioni già svolte restano attaccate
   * all'avatar, quindi non si cancella niente davvero. */
  it('archivia e riporta in catalogo', async () => {
    await deleteAvatar('a-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/avatars/a-1',
      options: { method: 'DELETE' },
    })

    await restoreAvatar('a-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/avatars/a-1/restore',
      options: { method: 'POST' },
    })
  })

  /* Il ritratto viaggia come FormData e non come JSON: è apiFetch a
   * riconoscerlo e a lasciare che sia fetch a scrivere il Content-Type con
   * il confine del multipart. */
  it('carica il ritratto come modulo, non come JSON', async () => {
    const file = new File(['x'], 'ritratto.png', { type: 'image/png' })
    await uploadAvatarImage(file)

    const { endpoint, options } = ultimaChiamata()
    expect(endpoint).toBe('/api/admin/avatars/image')
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)
    expect((options.body as FormData).get('file')).toBe(file)
  })
})

describe('categorie', () => {
  it("legge l'anagrafica di tutte le organizzazioni", async () => {
    await fetchAvatarCategories()
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/avatar-categories',
      options: { params: undefined },
    })
  })

  it("legge l'anagrafica di una sola organizzazione", async () => {
    await fetchAvatarCategories('org-1')
    expect(ultimaChiamata().options.params).toEqual({ organization_id: 'org-1' })
  })

  it('crea, modifica ed elimina una categoria', async () => {
    await createAvatarCategory({ name: 'Clienti', color: 'violet', organization_id: 'org-1' })
    expect(ultimaChiamata().endpoint).toBe('/api/admin/avatar-categories')

    await updateAvatarCategory('cat-1', { name: 'Clienti VIP', color: 'cyan' })
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/avatar-categories/cat-1',
      options: { method: 'PUT', body: { name: 'Clienti VIP', color: 'cyan' } },
    })

    await deleteAvatarCategory('cat-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/avatar-categories/cat-1',
      options: { method: 'DELETE' },
    })
  })
})

describe('strumenti del form avatar', () => {
  it("chiede l'anteprima del prompt per il canale scelto", async () => {
    await previewPersonaPrompt({ nome: 'Anna' }, 'voice')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/avatars/prompt-preview',
      options: { method: 'POST', body: { profile: { nome: 'Anna' }, channel: 'voice' } },
    })
  })

  it('legge il catalogo delle voci', async () => {
    await fetchVoices()
    expect(ultimaChiamata().endpoint).toBe('/api/admin/voices')
  })

  /* L'anteprima di una voce è audio: passa da apiFetchBlob, letta come JSON
   * arriverebbe corrotta. */
  it('scarica la battuta di prova come audio', async () => {
    await fetchVoicePreview('v-1', 'Buongiorno')
    expect(apiFetch).not.toHaveBeenCalled()
    expect(ultimaChiamata(apiFetchBlob)).toEqual({
      endpoint: '/api/admin/voices/preview',
      options: { method: 'POST', body: { voice_id: 'v-1', text: 'Buongiorno' } },
    })
  })

  it('lascia scegliere al server la battuta quando non se ne passa una', async () => {
    await fetchVoicePreview('v-1')
    expect(ultimaChiamata(apiFetchBlob).options.body).toEqual({ voice_id: 'v-1', text: null })
  })
})

describe('report', () => {
  it('restringe il recap al tenant e al periodo scelti', async () => {
    await fetchUsersReport('org-1', 30)
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/users-report',
      options: { params: { organization_id: 'org-1', days: '30' } },
    })
  })

  it('senza filtri chiede tutto lo scope e tutta la storia', async () => {
    await fetchUsersReport()
    expect(ultimaChiamata().options.params).toEqual({})
  })

  /* Il quadro d'insieme è l'unica lettura dell'area report che non è un
   * report: si chiede per una persona sola, e si scrive con una POST. */
  it('legge e fa scrivere il quadro di una persona', async () => {
    await fetchUserDebriefing('u-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/users/u-1/debriefing',
      options: {},
    })

    await generateUserDebriefing('u-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/users/u-1/debriefing',
      options: { method: 'POST' },
    })
  })

  it('legge i due report della dashboard', async () => {
    await fetchEvaluationsReport('org-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/evaluations-report',
      options: { params: { organization_id: 'org-1' } },
    })

    await fetchSimulationsReport()
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/simulations-report',
      options: { params: undefined },
    })
  })

  it('scarica il foglio di calcolo come file binario', async () => {
    await fetchEvaluationsReportXlsx('org-1')
    expect(ultimaChiamata(apiFetchBlob)).toEqual({
      endpoint: '/api/admin/evaluations-report/export',
      options: { params: { organization_id: 'org-1' } },
    })
  })
})

describe('revisione del docente', () => {
  it('riscrive la revisione in PUT', async () => {
    const payload = { summary_note: 'Bene', override_score: 8, override_reason: 'Contesto' }
    await saveConversationReview('c-1', payload)
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/conversations/c-1/review',
      options: { method: 'PUT', body: payload },
    })
  })

  it('ritira la revisione', async () => {
    await deleteConversationReview('c-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/conversations/c-1/review',
      options: { method: 'DELETE' },
    })
  })

  /* L'annotazione si scrive in PUT sulla collezione e non in POST: al
   * massimo ce n'è una per messaggio, e la seconda sostituisce la prima
   * invece di affiancarsi. */
  it("appunta una nota sostituendo quella che c'era", async () => {
    await saveMessageAnnotation('c-1', 'm-1', 'Qui potevi ascoltare di più')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/conversations/c-1/annotations',
      options: { method: 'PUT', body: { message_id: 'm-1', note: 'Qui potevi ascoltare di più' } },
    })
  })

  /* Un'annotazione si toglie dal suo id e non dalla conversazione: è
   * l'unica cosa che la identifica quando la conversazione ne ha diverse. */
  it('toglie una nota dal suo id', async () => {
    await deleteMessageAnnotation('n-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/annotations/n-1',
      options: { method: 'DELETE' },
    })
  })
})

describe('conversazioni altrui', () => {
  it('legge trascrizione e valutazione insieme', async () => {
    await fetchAdminConversation('c-1')
    expect(ultimaChiamata().endpoint).toBe('/api/admin/conversations/c-1')
  })

  it('elimina la conversazione', async () => {
    await deleteAdminConversation('c-1')
    expect(ultimaChiamata()).toEqual({
      endpoint: '/api/admin/conversations/c-1',
      options: { method: 'DELETE' },
    })
  })

  /* Il PDF di una conversazione altrui ha un indirizzo suo: quello dello
   * studente serve solo il proprietario, e riusarlo qui darebbe 403. */
  it('scarica la pagella altrui dal proprio indirizzo', async () => {
    await fetchAdminEvaluationPdf('c-1')
    expect(ultimaChiamata(apiFetchBlob).endpoint).toBe(
      '/api/admin/conversations/c-1/evaluation/pdf',
    )
  })
})
