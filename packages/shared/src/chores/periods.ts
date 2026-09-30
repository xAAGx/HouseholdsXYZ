import type { Enums } from '@households/db'

export type ChoreRepeat = Enums<'chore_repeat'>

// Dates here are calendar dates as "YYYY-MM-DD" strings: the household's
// day, not a moment in time, so time zones can't shift them.

/** Today's date on this device, as "YYYY-MM-DD". */
export function localDate(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parse(day: string): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d))
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** `day` plus `days` (which may be negative). */
export function addDays(day: string, days: number): string {
  const date = parse(day)
  date.setUTCDate(date.getUTCDate() + days)
  return format(date)
}

/**
 * The repeat a day belongs to. Mirrors private.chore_period_start in the
 * database: weeks start on Monday, months on the 1st, and a one-off chore has
 * a single period, the day it was created.
 */
export function chorePeriodStart(repeat: ChoreRepeat, day: string, createdOn: string): string {
  switch (repeat) {
    case 'daily':
      return day
    case 'weekly': {
      const isoWeekday = parse(day).getUTCDay() || 7
      return addDays(day, 1 - isoWeekday)
    }
    case 'monthly':
      return `${day.slice(0, 8)}01`
    case 'once':
      return createdOn
  }
}

/**
 * Days in a row with at least one chore done, counting back from today (or
 * from yesterday, so a streak isn't lost before today's chores are done).
 */
export function currentStreak(doneDays: Iterable<string>, today: string): number {
  const days = new Set(doneDays)
  let cursor = days.has(today) ? today : addDays(today, -1)
  let streak = 0
  while (days.has(cursor)) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}
