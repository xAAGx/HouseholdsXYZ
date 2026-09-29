import type { AccountType } from '../permissions/roles'

/** The signed-in user's own profile. Contact details are never part of it. */
export interface MyProfile {
  id: string
  displayName: string
  avatarPath: string | null
  accountType: AccountType
  isDiscoverable: boolean
}
