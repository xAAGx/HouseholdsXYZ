import type { HouseholdView } from '@households/shared'
import { useParams } from 'react-router'

export type MemberView = Extract<HouseholdView, { kind: 'member' }>

/** The household address from the URL, e.g. /us/california/san-francisco/TheSmiths. */
export function useHouseholdAddress() {
  const params = useParams()
  const address = {
    country: params.country ?? '',
    region: params.region ?? '',
    city: params.city ?? '',
    name: params.name ?? '',
  }
  const basePath = `/${address.country}/${address.region}/${address.city}/${address.name}`
  return { address, basePath }
}

/** Member names by id, for showing who did what. */
export function memberNames(view: MemberView): Map<string, string> {
  return new Map(view.members.map((member) => [member.profileId, member.displayName]))
}
