import { describe, expect, it } from 'vitest'

import { householdSlugSchema, isReservedHouseholdSlug, suggestHouseholdSlug } from './slug'

describe('householdSlugSchema', () => {
  it.each(['TheSmithsHouse', 'smiths', 'the-smiths-2', 'abc'])('accepts %s', (slug) => {
    expect(householdSlugSchema.safeParse(slug).success).toBe(true)
  })

  it.each([
    ['too short', 'ab'],
    ['too long', 'a'.repeat(33)],
    ['leading hyphen', '-smiths'],
    ['trailing hyphen', 'smiths-'],
    ['double hyphen', 'the--smiths'],
    ['spaces', 'the smiths'],
    ['non-ASCII look-alike', `th${String.fromCodePoint(0x0435)}smiths`], // Cyrillic "e"
    ['path traversal', '../admin'],
    ['reserved', 'Admin'],
  ])('rejects %s', (_label, slug) => {
    expect(householdSlugSchema.safeParse(slug).success).toBe(false)
  })
})

describe('isReservedHouseholdSlug', () => {
  it('is case-insensitive', () => {
    expect(isReservedHouseholdSlug('SETTINGS')).toBe(true)
    expect(isReservedHouseholdSlug('TheSmiths')).toBe(false)
  })
})

describe('suggestHouseholdSlug', () => {
  it('builds a valid slug from a name', () => {
    const slug = suggestHouseholdSlug("The Smiths' House")
    expect(slug).toBe('TheSmithsHouse')
    expect(householdSlugSchema.safeParse(slug).success).toBe(true)
  })

  it('strips accents', () => {
    expect(suggestHouseholdSlug('Casa García')).toBe('CasaGarcia')
  })
})
