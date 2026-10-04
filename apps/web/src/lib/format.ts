const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

/** "12 Oct" in the reader's own format. */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso))
}

/** "4:05 PM" in the reader's own format. */
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso))
}

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/** A calendar date ("2026-10-05") as "Mon 5 Oct", with no time-zone shift. */
export function formatDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`))
}

const fullDayFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** A calendar date with the year, e.g. a date of birth: "1 January 1990". */
export function formatFullDay(day: string): string {
  return fullDayFormat.format(new Date(`${day}T00:00:00Z`))
}

const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** "just now", "5 minutes ago", "yesterday", then the date. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000)
  const minutes = Math.round(seconds / 60)
  const hours = Math.round(minutes / 60)
  const days = Math.round(hours / 24)
  if (Math.abs(seconds) < 60) return relativeFormat.format(0, 'second')
  if (Math.abs(minutes) < 60) return relativeFormat.format(minutes, 'minute')
  if (Math.abs(hours) < 24) return relativeFormat.format(hours, 'hour')
  if (Math.abs(days) < 7) return relativeFormat.format(days, 'day')
  return formatDate(iso)
}
