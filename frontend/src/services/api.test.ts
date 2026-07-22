import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// refreshSession is called on a 401; mock it so no real auth call happens.
const refreshSession = vi.fn()
vi.mock('./auth', () => ({ refreshSession: () => refreshSession() }))

import { apiFetch, getAvatarImageUrl } from './api'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'status',
    json: async () => body,
  } as Response
}

describe('getAvatarImageUrl', () => {
  it('leaves absolute URLs untouched', () => {
    expect(getAvatarImageUrl('https://cdn.test/a.png')).toBe('https://cdn.test/a.png')
  })

  it('keeps a relative path same-origin', () => {
    expect(getAvatarImageUrl('/static/avatars/a.png')).toBe('/static/avatars/a.png')
  })
})

describe('apiFetch', () => {
  beforeEach(() => {
    refreshSession.mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the parsed JSON body on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([{ id: '1' }]))
    const data = await apiFetch<{ id: string }[]>('/api/avatars')
    expect(data).toEqual([{ id: '1' }])
  })

  it('serializes a body as JSON with the right Content-Type', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ok: true }))
    await apiFetch('/api/avatars/select', { method: 'POST', body: { avatar_id: 'x' } })

    const init = vi.mocked(fetch).mock.calls[0][1]
    expect(init).toBeDefined()
    expect((init!.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init!.body).toBe(JSON.stringify({ avatar_id: 'x' }))
    expect(init!.credentials).toBe('include')
  })

  it('appends query params, skipping empty ones', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]))
    await apiFetch('/api/avatars', { params: { category: 'clienti', empty: '' } })

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/avatars?category=clienti')
  })

  it('throws with the detail from an error body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: 'Avatar non trovato.' }, 404))
    await expect(apiFetch('/api/avatars/missing')).rejects.toThrow('Avatar non trovato.')
  })

  it('refreshes the session once on 401 and retries', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ detail: 'scaduto' }, 401))
      .mockResolvedValueOnce(jsonResponse({ id: 'ok' }))
    refreshSession.mockResolvedValueOnce(true)

    const data = await apiFetch<{ id: string }>('/api/avatars/1')
    expect(refreshSession).toHaveBeenCalledOnce()
    expect(data).toEqual({ id: 'ok' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
