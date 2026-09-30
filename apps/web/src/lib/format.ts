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
