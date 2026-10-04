import { addDays, isoWeekday } from '@households/shared'

// Calendar dates are "YYYY-MM-DD" wall-clock dates; months are "YYYY-MM".

/** The month a date is in: "2026-10-06" → "2026-10". */
export const monthOf = (day: string) => day.slice(0, 7)

export function addMonths(month: string, months: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const index = y * 12 + (m - 1) + months
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** The weeks shown for a month, Monday to Sunday, padded with the days around it. */
export function monthWeeks(month: string): string[][] {
  const first = `${month}-01`
  let day = addDays(first, 1 - isoWeekday(first))
  const weeks: string[][] = []
  do {
    const week: string[] = []
    for (let i = 0; i < 7; i++) {
      week.push(day)
      day = addDays(day, 1)
    }
    weeks.push(week)
  } while (monthOf(day) === month)
  return weeks
}

const monthFormat = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** "October 2026". */
export const formatMonth = (month: string) => monthFormat.format(new Date(`${month}-01T00:00:00Z`))

const longDayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

/** "Tuesday 6 October". */
export const formatLongDay = (day: string) => longDayFormat.format(new Date(`${day}T00:00:00Z`))

const clockFormat = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
})

/** A wall-clock time ("15:30") in the reader's own style ("3:30 PM"). */
export const formatClock = (time: string) => clockFormat.format(new Date(`1970-01-01T${time}:00Z`))

/** "Africa/Cairo" → "Cairo". */
export const zoneCity = (timeZone: string) =>
  (timeZone.split('/').pop() ?? timeZone).replace(/_/g, ' ')
