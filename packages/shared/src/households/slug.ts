import { z } from 'zod'

// Mirrors the CHECK constraint and reserved list in
// supabase/migrations/20260929120000_core_identity_households.sql.
// The database is the authority; this copy gives instant feedback in forms.

export const HOUSEHOLD_SLUG_MIN_LENGTH = 3
export const HOUSEHOLD_SLUG_MAX_LENGTH = 32

/** ASCII letters, digits and single hyphens; must start and end with a letter or digit. */
const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{1,30}[A-Za-z0-9]$/

export const RESERVED_HOUSEHOLD_SLUGS: ReadonlySet<string> = new Set([
  'about', 'account', 'accounts', 'admin', 'administrator', 'api', 'app',
  'assets', 'auth', 'billing', 'blog', 'business', 'cdn', 'chat', 'deals',
  'email', 'explore', 'help', 'house', 'household', 'households', 'invite',
  'invites', 'legal', 'login', 'logout', 'mail', 'marketplace', 'messages',
  'moderator', 'neighborhood', 'neighbourhood', 'new', 'notifications', 'null',
  'official', 'premium', 'privacy', 'profile', 'register', 'root', 'search',
  'security', 'settings', 'sign-in', 'sign-up', 'signin', 'signup', 'staff',
  'static', 'status', 'support', 'system', 'team', 'terms', 'undefined',
  'verified', 'verify', 'www',
]) // prettier-ignore

/** Case-insensitive key used for uniqueness and lookups ("TheSmithsHouse" → "thesmithshouse"). */
export function householdSlugKey(slug: string): string {
  return slug.toLowerCase()
}

export function isReservedHouseholdSlug(slug: string): boolean {
  return RESERVED_HOUSEHOLD_SLUGS.has(householdSlugKey(slug))
}

export const householdSlugSchema = z
  .string()
  .trim()
  .min(HOUSEHOLD_SLUG_MIN_LENGTH, `Use at least ${HOUSEHOLD_SLUG_MIN_LENGTH} characters.`)
  .max(HOUSEHOLD_SLUG_MAX_LENGTH, `Use at most ${HOUSEHOLD_SLUG_MAX_LENGTH} characters.`)
  .regex(
    SLUG_PATTERN,
    'Use letters, numbers and hyphens, starting and ending with a letter or number.',
  )
  .refine((slug) => !slug.includes('--'), 'Hyphens can’t be next to each other.')
  .refine((slug) => !isReservedHouseholdSlug(slug), 'That address is reserved. Try another.')

/** Suggests a slug from a household name: "The Smiths' House" → "TheSmithsHouse". */
export function suggestHouseholdSlug(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // strip accents (combining marks)
    .replace(/[^A-Za-z0-9\s-]/g, '')
    .split(/[\s-]+/)
    .filter(Boolean)
  const slug = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  return slug.slice(0, HOUSEHOLD_SLUG_MAX_LENGTH)
}
