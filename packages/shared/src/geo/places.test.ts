import { describe, expect, it } from 'vitest'

import { countryCodeSchema, placeSearchText, placeSlug, placeSlugSchema } from './places'

describe('placeSlug', () => {
  it.each([
    ['San Francisco', 'san-francisco'],
    ['São Paulo', 'sao-paulo'],
    ["Val-d'Or", 'val-dor'],
    ['Saint-Étienne', 'saint-etienne'],
    ['  New   York  City ', 'new-york-city'],
    ['Zürich', 'zurich'],
  ])('%s → %s', (name, slug) => {
    expect(placeSlug(name)).toBe(slug)
    expect(placeSlugSchema.safeParse(slug).success).toBe(true)
  })

  it('returns an empty string when nothing usable remains', () => {
    expect(placeSlug('東京')).toBe('')
  })

  it('never ends with a hyphen after truncation', () => {
    const slug = placeSlug(`${'a'.repeat(79)} b`)
    expect(slug.endsWith('-')).toBe(false)
    expect(slug.length).toBeLessThanOrEqual(80)
  })
})

describe('countryCodeSchema', () => {
  it('normalizes to upper case', () => {
    expect(countryCodeSchema.parse('us')).toBe('US')
  })

  it.each(['usa', 'u', '1a', ''])('rejects %s', (code) => {
    expect(countryCodeSchema.safeParse(code).success).toBe(false)
  })
})

describe('placeSearchText', () => {
  it.each([
    ['São Pau', 'Sao Pau'],
    ['  new   york ', 'new york'],
    ["Val-d'Or", "Val-d'Or"],
    ['San%_Fran(cisco)', 'SanFrancisco'],
  ])('%s → %s', (input, expected) => {
    expect(placeSearchText(input)).toBe(expected)
  })
})
