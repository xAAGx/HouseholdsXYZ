import type { HouseholdPlace } from '../geo/places'
import type { AccountType } from '../permissions/roles'

/**
 * The signed-in user's own profile. Date of birth and phone live separately
 * (account_details) and are never part of profile data.
 */
export interface MyProfile {
  id: string
  displayName: string
  firstName: string | null
  lastName: string | null
  avatarPath: string | null
  accountType: AccountType
  isDiscoverable: boolean
  /** Home city from sign-up; pre-fills new households. Never set for children. */
  cityId: number | null
  place: HouseholdPlace | null
}
