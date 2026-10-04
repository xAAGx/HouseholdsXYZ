import { formatMoney } from '@households/shared'

/** Formats minor units in one household's currency. */
export function moneyFormatter(currency: string, digits: number) {
  return (minor: number) => formatMoney(minor, currency, digits)
}

export type FormatMoney = ReturnType<typeof moneyFormatter>

/** "2026-10" plus or minus some months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number) as [number, number]
  const date = new Date(Date.UTC(year, m - 1 + delta, 1))
  return date.toISOString().slice(0, 7)
}

const monthFormat = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** "2026-10" as "October 2026". */
export function monthLabel(month: string): string {
  return monthFormat.format(new Date(`${month}-01T00:00:00Z`))
}

/** Whole days from one calendar date to another (negative if it's past). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** "Due today", "Due in 3 days", "3 days late". */
export function dueText(today: string, due: string): string {
  const days = daysBetween(today, due)
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days > 1) return `Due in ${days} days`
  return days === -1 ? '1 day late' : `${-days} days late`
}
