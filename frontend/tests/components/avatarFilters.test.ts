import { describe, expect, it } from 'vitest'

import { countByCategory, filterAvatars } from '../../src/components/avatarFilters'
import type { Avatar } from '../../src/services/api'

const avatar = (over: Partial<Avatar> = {}): Avatar => ({
  id: 'a-1',
  name: 'Cliente arrabbiato',
  image_url: '/static/avatars/a-1.png',
  category: 'Clienti',
  category_id: 'cat-1',
  category_color: 'violet',
  description: 'Chiama per un addebito non riconosciuto',
  created_at: '2026-01-01T10:00:00Z',
  own_sessions: 0,
  last_session_at: null,
  ...over,
})

const catalogo = [
  avatar(),
  avatar({
    id: 'a-2',
    name: 'Collega scettico',
    category: 'Colleghi',
    category_id: 'cat-2',
    description: 'Non crede nel nuovo processo',
  }),
  avatar({ id: 'a-3', name: 'Cliente indeciso', description: null }),
]

describe('filterAvatars', () => {
  it('senza categoria e senza ricerca lascia passare tutto', () => {
    expect(filterAvatars(catalogo, null, '')).toHaveLength(3)
  })

  it('tiene solo la categoria scelta', () => {
    expect(filterAvatars(catalogo, 'cat-2', '').map((a) => a.id)).toEqual(['a-2'])
  })

  it('cerca nel nome', () => {
    expect(filterAvatars(catalogo, null, 'collega').map((a) => a.id)).toEqual(['a-2'])
  })

  /* Chi scrive «addebito» sta cercando una situazione, e la situazione è
   * scritta nella descrizione, non nel nome. */
  it('cerca anche nello scenario e nella categoria', () => {
    expect(filterAvatars(catalogo, null, 'addebito').map((a) => a.id)).toEqual(['a-1'])
    expect(filterAvatars(catalogo, null, 'colleghi').map((a) => a.id)).toEqual(['a-2'])
  })

  it('ignora maiuscole e accenti', () => {
    expect(filterAvatars(catalogo, null, 'CLIENTE')).toHaveLength(2)
  })

  /* Una descrizione vuota è normale (vedi la scheda persona): non deve far
   * cadere il filtro né escludere l'avatar da una ricerca sul nome. */
  it('regge una descrizione assente', () => {
    expect(filterAvatars(catalogo, null, 'indeciso').map((a) => a.id)).toEqual(['a-3'])
  })

  it('applica insieme categoria e ricerca', () => {
    expect(filterAvatars(catalogo, 'cat-1', 'collega')).toEqual([])
    expect(filterAvatars(catalogo, 'cat-1', 'indeciso').map((a) => a.id)).toEqual(['a-3'])
  })
})

describe('countByCategory', () => {
  it('conta quanti avatar stanno in ogni categoria', () => {
    expect(countByCategory(catalogo)).toEqual({ 'cat-1': 2, 'cat-2': 1 })
  })

  /* Una categoria senza avatar non compare nella mappa: chi la legge deve
   * ricadere su zero, ed è quello che fa la pastiglia dei filtri. */
  it('non inventa una voce per le categorie vuote', () => {
    expect(countByCategory([])).toEqual({})
  })
})
