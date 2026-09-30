import type { HouseholdPlace } from '@households/shared'

/** PostgREST embed for a city with its region, for `.select()` strings. */
export const CITY_EMBED = 'slug, name, country_code, region:geo_regions!inner(id, slug, name)'

interface CityRow {
  slug: string
  name: string
  country_code: string
  region: { id: string; slug: string; name: string }
}

export function toPlace(city: CityRow | null): HouseholdPlace | null {
  if (!city) return null
  return {
    countryCode: city.country_code,
    regionId: city.region.id,
    regionSlug: city.region.slug,
    regionName: city.region.name,
    citySlug: city.slug,
    cityName: city.name,
  }
}
