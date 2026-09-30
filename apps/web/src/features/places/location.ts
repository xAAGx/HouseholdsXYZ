import type { HouseholdPlace } from '@households/shared'

import type { CityOption } from './queries'

/** The value of a LocationPicker. Slugs are kept for address previews. */
export interface LocationValue {
  countryCode: string
  regionId: string
  regionSlug: string
  city: CityOption | null
}

export const EMPTY_LOCATION: LocationValue = {
  countryCode: '',
  regionId: '',
  regionSlug: '',
  city: null,
}

/** Pre-fills a picker from a saved place (e.g. the home city from sign-up). */
export function locationFromPlace(
  place: HouseholdPlace | null | undefined,
  cityId: number | null | undefined,
): LocationValue {
  if (!place || cityId == null) return EMPTY_LOCATION
  return {
    countryCode: place.countryCode,
    regionId: place.regionId,
    regionSlug: place.regionSlug,
    city: { id: cityId, name: place.cityName, slug: place.citySlug, district: null },
  }
}
