import { z } from 'zod'

import { isTimeZone } from '../calendar/schemas'
import {
  cityIdSchema,
  countryCodeSchema,
  placeSlugSchema,
  type HouseholdPlace,
} from '../geo/places'
import { isCurrency } from '../money/format'
import type { HouseholdPermission, HouseholdRole } from '../permissions/roles'
import type { HouseholdVisibility } from '../privacy/visibility'
import type { HouseholdMember } from './members'
import { householdSlugSchema } from './slug'

export const householdNameSchema = z
  .string()
  .trim()
  .min(1, 'Give your household a name.')
  .max(80, 'Use at most 80 characters.')

export const householdBioSchema = z.string().trim().max(500, 'Use at most 500 characters.')

/**
 * A coarse, human-entered area such as "Kitsilano, Vancouver". Never ask for
 * or store street addresses or coordinates here.
 */
export const householdAreaSchema = z.string().trim().max(120, 'Use at most 120 characters.')

export const createHouseholdInputSchema = z.strictObject({
  name: householdNameSchema,
  /** The last part of the address. Unique within the city. */
  slug: householdSlugSchema,
  cityId: cityIdSchema,
})
export type CreateHouseholdInput = z.infer<typeof createHouseholdInputSchema>

/** A household as listed for one of its members. */
export interface HouseholdSummary {
  id: string
  slug: string
  name: string
  visibility: HouseholdVisibility
  avatarPath: string | null
  myRole: HouseholdRole
  /** Null only for households created before addresses had a city. */
  place: HouseholdPlace | null
}

/** The segments of /<country>/<region>/<city>/<name>. */
export const householdAddressSchema = z.object({
  country: countryCodeSchema,
  region: placeSlugSchema,
  city: placeSlugSchema,
  name: householdSlugSchema,
})
export type HouseholdAddress = z.infer<typeof householdAddressSchema>

/**
 * Who can see a household's page. Connections and neighborhood audiences come
 * later; until then a household is either members-only or public.
 */
export const settableVisibilitySchema = z.enum(['private', 'public'])

export const updateHouseholdInputSchema = z
  .strictObject({
    name: householdNameSchema.optional(),
    bio: householdBioSchema.optional(),
    visibility: settableVisibilitySchema.optional(),
    /** For reminders at home time ("Africa/Cairo"). */
    timeZone: z.string().max(64).refine(isTimeZone, 'Choose a real time zone.').optional(),
    /** ISO 4217, e.g. "EGP". */
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'Choose a currency.')
      .refine(isCurrency, 'Choose a currency.')
      .optional(),
    /** What 100 chore points are worth in pocket money, in minor units (null: nothing). */
    pointsValueMinor: z.number().int().min(1).max(1000000).nullable().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Nothing to change.',
  })
export type UpdateHouseholdInput = z.infer<typeof updateHouseholdInputSchema>

/** A new address: another city, another name, or both. The old one redirects members. */
export const moveHouseholdInputSchema = z.strictObject({
  cityId: cityIdSchema,
  slug: householdSlugSchema,
})
export type MoveHouseholdInput = z.infer<typeof moveHouseholdInputSchema>

export interface HouseholdDetail {
  id: string
  slug: string
  name: string
  bio: string | null
  visibility: HouseholdVisibility
  cityId: number | null
  place: HouseholdPlace | null
  /** Null until someone sets it (reminders then use UTC). */
  timeZone: string | null
  currency: string
  currencyDigits: number
  pointsValueMinor: number | null
}

/** What outsiders see of a public household: never its members. */
export interface PublicHouseholdProfile {
  name: string
  bio: string | null
  place: HouseholdPlace | null
}

/** The household page, depending on who is looking. */
export type HouseholdView =
  | {
      kind: 'member'
      household: HouseholdDetail
      myRole: HouseholdRole
      permissions: HouseholdPermission[]
      members: HouseholdMember[]
      /** For people who manage chores: chores and reward requests waiting for them. */
      pendingApprovals: number
    }
  | { kind: 'public'; household: PublicHouseholdProfile }
  /** An old address of a household the caller can see. */
  | { kind: 'moved'; path: string }
