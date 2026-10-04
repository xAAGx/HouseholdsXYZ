import type { Enums } from '@households/db'

import { addDays } from '../chores/periods'

// Repeating events are stored once and expanded here, for both the API and
// the apps. Dates are "YYYY-MM-DD" wall-clock dates in the household's time
// zone, so clock changes never move an event.

export type EventRepeat = Enums<'event_repeat'>

export interface EventSchedule {
  startsOn: string
  endsOn: string
  repeat: EventRepeat
  repeatUntil: string | null
  skippedOn: readonly string[]
}

/** One time an event happens: its first and last day. */
export interface Occurrence {
  date: string
  endDate: string
}

function parts(day: string): [number, number, number] {
  return day.split('-').map(Number) as [number, number, number]
}

/** Whole days from `a` to `b` (negative if `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = parts(a)
  const [by, bm, bd] = parts(b)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/** The date, or null if that month has no such day (31 April, 29 Feb 2027). */
function dateOf(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date.toISOString().slice(0, 10)
}

/** The k-th repeat's first day, or null when that repeat doesn't exist. */
function nthStart(schedule: EventSchedule, k: number): string | null {
  const [y, m, d] = parts(schedule.startsOn)
  switch (schedule.repeat) {
    case 'none':
      return k === 0 ? schedule.startsOn : null
    case 'daily':
      return addDays(schedule.startsOn, k)
    case 'weekly':
      return addDays(schedule.startsOn, 7 * k)
    case 'fortnightly':
      return addDays(schedule.startsOn, 14 * k)
    case 'monthly': {
      const months = m - 1 + k
      // A monthly event on the 31st happens only in months with a 31st.
      return dateOf(y + Math.floor(months / 12), (months % 12) + 1, d)
    }
    case 'yearly':
      return dateOf(y + k, m, d)
  }
}

/** A repeat number at or before the first one that could reach `from`. */
function firstCandidate(schedule: EventSchedule, from: string, length: number): number {
  const gap = daysBetween(schedule.startsOn, from) - length
  if (gap <= 0) return 0
  switch (schedule.repeat) {
    case 'none':
      return 0
    case 'daily':
      return gap
    case 'weekly':
      return Math.floor(gap / 7)
    case 'fortnightly':
      return Math.floor(gap / 14)
    case 'monthly':
      return Math.max(0, Math.floor(gap / 31) - 1)
    case 'yearly':
      return Math.max(0, Math.floor(gap / 366) - 1)
  }
}

/**
 * The times an event happens that overlap `from`…`to` (inclusive), in order,
 * leaving out skipped ones. Stops after `limit` to stay cheap.
 */
export function eventOccurrences(
  schedule: EventSchedule,
  from: string,
  to: string,
  limit = 400,
): Occurrence[] {
  const length = daysBetween(schedule.startsOn, schedule.endsOn)
  const skipped = new Set(schedule.skippedOn)
  const occurrences: Occurrence[] = []
  const last = schedule.repeatUntil && schedule.repeatUntil < to ? schedule.repeatUntil : to

  // Monthly and yearly repeats can be missing (31sts, 29 Februarys): allow
  // a few empty steps before giving up.
  let misses = 0
  for (let k = firstCandidate(schedule, from, length); occurrences.length < limit; k++) {
    const date = nthStart(schedule, k)
    if (date === null) {
      if (schedule.repeat === 'none' || ++misses > 12) break
      continue
    }
    misses = 0
    if (date > last) break
    const endDate = addDays(date, length)
    if (endDate >= from && !skipped.has(date)) occurrences.push({ date, endDate })
    if (schedule.repeat === 'none') break
  }
  return occurrences
}
