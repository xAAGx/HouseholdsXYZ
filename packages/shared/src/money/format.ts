// Money is stored as whole minor units (cents) in the household's currency;
// these turn it into text and back, in the reader's own style.

/** True for ISO 4217 codes this device knows. */
export function isCurrency(code: string): boolean {
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code })
    return /^[A-Z]{3}$/.test(code)
  } catch {
    return false
  }
}

/** Digits after the point for a currency: 2 for USD, 0 for JPY, 3 for KWD. */
export function currencyDigits(code: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions()
        .maximumFractionDigits ?? 2
    )
  } catch {
    return 2
  }
}

/** A sensible currency for a country (the household's place). */
export const COUNTRY_CURRENCIES: Record<string, string> = {
  US: 'USD', CA: 'CAD', GB: 'GBP', IE: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR',
  NL: 'EUR', BE: 'EUR', AT: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR', EG: 'EGP', SA: 'SAR',
  AE: 'AED', KW: 'KWD', QA: 'QAR', JO: 'JOD', MA: 'MAD', TR: 'TRY', IN: 'INR', PK: 'PKR',
  AU: 'AUD', NZ: 'NZD', JP: 'JPY', CN: 'CNY', KR: 'KRW', BR: 'BRL', MX: 'MXN', ZA: 'ZAR',
  NG: 'NGN', KE: 'KES', SE: 'SEK', NO: 'NOK', DK: 'DKK', CH: 'CHF', PL: 'PLN',
} // prettier-ignore

/** "1,234.50 US$"-style text in the reader's locale; minus for negatives. */
export function formatMoney(minor: number, currency: string, digits: number): string {
  const value = minor / 10 ** digits
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value)
  } catch {
    return `${value.toFixed(digits)} ${currency}`
  }
}

/**
 * What someone typed ("12.5", "1,200", "12,50") as minor units, or null.
 * A comma followed by exactly the currency's digits is read as the decimal
 * point; other commas and spaces separate thousands.
 */
export function parseMoney(text: string, digits: number): number | null {
  let value = text.trim().replace(/[\s\u00a0']/g, '')
  if (!value) return null
  const decimalComma =
    digits > 0 &&
    new RegExp(`^\\d{1,3}(\\.\\d{3})*,\\d{${digits}}$|^\\d+,\\d{${digits}}$`).test(value)
  value = decimalComma ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(value)) return null
  const [whole = '0', fraction = ''] = value.split('.')
  if (fraction.length > digits) return null
  const minor = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0') || 0)
  return Number.isSafeInteger(minor) ? minor : null
}

/** Minor units as an editable number string ("12.50"), no currency sign. */
export function moneyInput(minor: number, digits: number): string {
  return (minor / 10 ** digits).toFixed(digits)
}
