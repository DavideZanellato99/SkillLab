import { describe, expect, it } from 'vitest'

import { CATEGORY_COLOR_CLASSES, CATEGORY_COLORS, categoryBadgeClasses } from './categoryStyles'

describe('categoryBadgeClasses', () => {
  it('returns the mapped classes for a known colour', () => {
    expect(categoryBadgeClasses('cyan')).toBe(CATEGORY_COLOR_CLASSES.cyan)
  })

  it('falls back to the neutral tone for an unknown colour', () => {
    expect(categoryBadgeClasses('fucsia')).toBe(CATEGORY_COLOR_CLASSES.slate)
  })

  it('offers every mapped colour as a choice', () => {
    expect(CATEGORY_COLORS).toEqual(Object.keys(CATEGORY_COLOR_CLASSES))
  })

  it('writes every class in full, or Tailwind would not compile it', () => {
    for (const classes of Object.values(CATEGORY_COLOR_CLASSES)) {
      expect(classes).not.toContain('${')
    }
  })
})
