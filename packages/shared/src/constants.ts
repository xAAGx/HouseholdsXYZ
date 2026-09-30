import type { HouseholdPlace } from './geo/places'

export const APP_NAME = 'Households.xyz'

/**
 * A household's address: households.xyz/<country>/<region>/<city>/<name>,
 * e.g. /us/california/san-francisco/TheSmiths. The name is unique per city.
 */
export function householdPath(
  place: Pick<HouseholdPlace, 'countryCode' | 'regionSlug' | 'citySlug'>,
  slug: string,
): string {
  return [place.countryCode.toLowerCase(), place.regionSlug, place.citySlug, slug]
    .map(encodeURIComponent)
    .reduce((path, segment) => `${path}/${segment}`, '')
}
