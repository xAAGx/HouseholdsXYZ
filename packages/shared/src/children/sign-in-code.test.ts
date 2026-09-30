import { describe, expect, it } from 'vitest'

import {
  addChildInputSchema,
  CHILD_CODE_ALPHABET,
  childSignInCodeSchema,
  formatChildCode,
  normalizeChildCode,
} from './sign-in-code'

describe('child sign-in codes', () => {
  it('leave out look-alike characters', () => {
    for (const ambiguous of ['I', 'O', '0', '1']) {
      expect(CHILD_CODE_ALPHABET).not.toContain(ambiguous)
    }
    expect(new Set(CHILD_CODE_ALPHABET).size).toBe(32)
  })

  it('accept however a child types them', () => {
    expect(normalizeChildCode(' k7p4-mx2q ')).toBe('K7P4MX2Q')
    expect(childSignInCodeSchema.parse('k7p4 mx2q')).toBe('K7P4MX2Q')
  })

  it('reject wrong lengths and characters outside the alphabet', () => {
    for (const bad of ['K7P4MX2', 'K7P4MX2QQ', 'K7P4MX2O', 'K7P4MX21', '', 'K7P4_MX2Q']) {
      expect(childSignInCodeSchema.safeParse(bad).success, bad).toBe(false)
    }
  })

  it('are shown in two groups of four', () => {
    expect(formatChildCode('K7P4MX2Q')).toBe('K7P4-MX2Q')
  })
})

describe('adding a child', () => {
  it('needs a name of 1 to 50 characters', () => {
    expect(addChildInputSchema.parse({ displayName: '  Leo ' })).toEqual({ displayName: 'Leo' })
    expect(addChildInputSchema.safeParse({ displayName: ' ' }).success).toBe(false)
    expect(addChildInputSchema.safeParse({ displayName: 'x'.repeat(51) }).success).toBe(false)
  })
})
