export const APP_NAME = 'Households.xyz'

/** Path prefix for a household's page: households.xyz/house/TheSmithsHouse */
export const HOUSEHOLD_PATH_PREFIX = '/house'

export function householdPath(slug: string): string {
  return `${HOUSEHOLD_PATH_PREFIX}/${encodeURIComponent(slug)}`
}
