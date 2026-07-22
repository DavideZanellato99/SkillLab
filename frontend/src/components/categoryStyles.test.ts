import { describe, expect, it } from 'vitest'

import { CATEGORY_BADGE_CLASSES, categoryBadgeClasses } from './categoryStyles'

describe('categoryBadgeClasses', () => {
  it('returns the mapped classes for a known category', () => {
    expect(categoryBadgeClasses('clienti')).toBe(CATEGORY_BADGE_CLASSES.clienti)
  })

  it('is case insensitive on the category slug', () => {
    expect(categoryBadgeClasses('Clienti')).toBe(CATEGORY_BADGE_CLASSES.clienti)
    expect(categoryBadgeClasses('SCI-FI')).toBe(CATEGORY_BADGE_CLASSES['sci-fi'])
  })

  it('falls back to a neutral style for an unknown category', () => {
    const fallback = categoryBadgeClasses('sconosciuta')
    expect(fallback).toBe('bg-white/6 text-slate-400')
  })
})
