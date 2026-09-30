import { z } from 'zod'

import { cityIdSchema, type HouseholdPlace } from '../geo/places'
import type { HouseholdRole } from '../permissions/roles'
import type { HouseholdVisibility } from '../privacy/visibility'
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
