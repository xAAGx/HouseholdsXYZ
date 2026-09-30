import { z } from 'zod'

/**
 * Places come from GeoNames (CC BY 4.0), loaded by `pnpm geo:import`.
 * Wherever place names are shown, credit the source with GEONAMES_ATTRIBUTION.
 */
export const GEONAMES_ATTRIBUTION = 'Place data © GeoNames (CC BY 4.0)'

const SLUG_MAX = 80

/**
 * URL segment for a region or city: "São Paulo" → "sao-paulo",
 * "Val-d'Or" → "val-dor". Shared by the importer and the app, so they always
 * agree. Returns '' when nothing usable remains (callers fall back to an id).
 */
export function placeSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // strip accents (combining marks)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX)
    .replace(/^-+|-+$/g, '')
}

/**
 * Folds typed search text to plain ASCII ("São" → "Sao") so it matches the
 * ASCII city names, and drops characters that have no place in a city name.
 */
export function placeSearchText(query: string): string {
  return query
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s'’.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

export const countryCodeSchema = z
  .string()
  .regex(/^[A-Za-z]{2}$/, 'Choose a country.')
  .transform((code) => code.toUpperCase())

export const placeSlugSchema = z
  .string()
  .max(100)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Not a valid place.')

export const cityIdSchema = z
  .number({ error: 'Choose your city.' })
  .int()
  .positive('Choose your city.')

/** Where a household is, as shown in its address and URL. */
export interface HouseholdPlace {
  countryCode: string
  regionId: string
  regionSlug: string
  regionName: string
  citySlug: string
  cityName: string
}
