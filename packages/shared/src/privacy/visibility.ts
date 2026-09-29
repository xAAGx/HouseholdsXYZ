import { Constants, type Enums } from '@households/db'
import { z } from 'zod'

import type { HouseholdRole } from '../permissions/roles'

export type HouseholdVisibility = Enums<'household_visibility'>
export type ContentVisibility = Enums<'content_visibility'>

export const HOUSEHOLD_VISIBILITIES = Constants.public.Enums.household_visibility
/** Ordered from narrowest to widest audience. */
export const CONTENT_VISIBILITIES = Constants.public.Enums.content_visibility

/** Households are private until an owner/admin deliberately publishes them. */
export const DEFAULT_HOUSEHOLD_VISIBILITY: HouseholdVisibility = 'private'
/** New content is shared with the household only, never wider, unless the author chooses. */
export const DEFAULT_CONTENT_VISIBILITY: ContentVisibility = 'household'

export const householdVisibilitySchema = z.enum(HOUSEHOLD_VISIBILITIES)
export const contentVisibilitySchema = z.enum(CONTENT_VISIBILITIES)

export const HOUSEHOLD_VISIBILITY_LABELS: Record<HouseholdVisibility, string> = {
  private: 'Members only',
  connections: 'Connected households',
  neighborhood: 'Neighborhood',
  public: 'Public',
}

export const CONTENT_VISIBILITY_LABELS: Record<ContentVisibility, string> = {
  private: 'Only me',
  selected_members: 'Selected members',
  household: 'Household',
  connections: 'Connected households',
  neighborhood: 'Neighborhood',
  public: 'Public',
}

const rank = (v: ContentVisibility) => CONTENT_VISIBILITIES.indexOf(v)

/**
 * The widest audience a role may share content with. Children and teens can
 * never publish beyond the household. Every content table must enforce the
 * same ceiling in its RLS policies; this copy is for forms and UI.
 */
export function maxContentVisibilityForRole(role: HouseholdRole): ContentVisibility {
  switch (role) {
    case 'child':
    case 'teen':
    case 'guest':
    case 'caregiver':
      return 'household'
    case 'owner':
    case 'admin':
    case 'adult':
      return 'public'
  }
}

export function isVisibilityAllowedForRole(
  visibility: ContentVisibility,
  role: HouseholdRole,
): boolean {
  return rank(visibility) <= rank(maxContentVisibilityForRole(role))
}

/** Visibilities that make content reachable by people outside the household. */
export function isOutsideHousehold(visibility: ContentVisibility | HouseholdVisibility): boolean {
  return visibility === 'connections' || visibility === 'neighborhood' || visibility === 'public'
}
