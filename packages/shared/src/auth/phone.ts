import {
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min'

// libphonenumber-js carries per-country metadata (tens of kB), so only
// modules that really parse phone numbers should import this file.

/**
 * Parses a phone number typed in any common format for `countryCode`
 * ("(415) 555-0123", "0415 555 0123", "+44 20 …") and returns E.164
 * ("+14155550123"), or null if it isn't a valid number.
 */
export function normalizePhone(input: string, countryCode: string): string | null {
  const parsed = parsePhoneNumberFromString(input, countryCode.toUpperCase() as CountryCode)
  return parsed?.isValid() ? parsed.number : null
}

/** The international dialing code for a country ("US" → "+1"), or null if unknown. */
export function phoneCallingCode(countryCode: string): string | null {
  try {
    return `+${getCountryCallingCode(countryCode.toUpperCase() as CountryCode)}`
  } catch {
    return null
  }
}
