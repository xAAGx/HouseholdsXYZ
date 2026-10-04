import { addDays, isoWeekday } from '../chores/periods'
import type { EventRepeat } from './occurrences'

// Quick add: "Leo dentist Friday at noon" → an event for Leo, on Friday, at
// 12:00. Runs on the device; the app shows what it understood before saving,
// and the full form is always one tap away.

export interface QuickEventPerson {
  id: string
  /** Display name; the first word is matched too ("Maya Lopez" → "Maya"). */
  name: string
}

export interface QuickEvent {
  title: string
  startsOn: string
  /** For things that last several days ("Rome trip Oct 13-17"). */
  endsOn: string | null
  startTime: string | null
  endTime: string | null
  repeat: EventRepeat
  people: string[]
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const WEEKDAY = '(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|urday|rsday)?'
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTH =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?'

const pad = (n: number) => String(n).padStart(2, '0')

function weekdayIndex(word: string): number {
  return WEEKDAYS.findIndex((day) => day.startsWith(word.slice(0, 3).toLowerCase())) + 1
}

/** The next `weekday` (1 = Monday) on or after `from`; strictly after when `after`. */
function nextWeekday(from: string, weekday: number, after = false): string {
  let gap = (weekday - isoWeekday(from) + 7) % 7
  if (gap === 0 && after) gap = 7
  return addDays(from, gap)
}

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date.toISOString().slice(0, 10)
}

/** A day of the year: this year, or next year if it has passed. */
function upcoming(today: string, month: number, day: number, year?: number): string | null {
  if (year) return validDate(year, month, day)
  const thisYear = Number(today.slice(0, 4))
  const date = validDate(thisYear, month, day)
  if (date && date >= today) return date
  return validDate(thisYear + 1, month, day)
}

/**
 * 24-hour "HH:MM". Without am/pm: evening words ("dinner at 7") mean pm, and
 * otherwise 1-6 o'clock means afternoon (school runs, not 3 am); "18:30"
 * style times are taken as written.
 */
function clock(
  hour: number,
  minute: number,
  meridiem: string | undefined,
  { guess = true, evening = false }: { guess?: boolean; evening?: boolean } = {},
) {
  let h = hour
  if (meridiem === 'pm' && h < 12) h += 12
  else if (meridiem === 'am' && h === 12) h = 0
  else if (!meridiem && evening && h >= 1 && h <= 11) h += 12
  else if (!meridiem && guess && h >= 1 && h <= 6) h += 12
  if (h > 23 || minute > 59) return null
  return `${pad(h)}:${pad(minute)}`
}

const EVENING = /\b(tonight|dinner|supper|evening|party|drinks)\b/i

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Reads a short line as an event. Null when there's nothing left to call it
 * (just a date, or empty). Dates are wall-clock "YYYY-MM-DD"; `today` too.
 */
export function parseQuickEvent(
  text: string,
  today: string,
  people: QuickEventPerson[] = [],
): QuickEvent | null {
  let rest = ` ${text.replace(/\s+/g, ' ').trim()} `
  const take = (pattern: RegExp): RegExpExecArray | null => {
    const match = pattern.exec(rest)
    if (match) rest = rest.slice(0, match.index) + ' ' + rest.slice(match.index + match[0].length)
    return match
  }

  // ── Who it's for ──────────────────────────────────────────────────────────
  const chosen: string[] = []
  for (const person of people) {
    const names = [...new Set([person.name, person.name.split(' ')[0] ?? ''])]
      .filter((name) => name.length >= 2)
      .sort((a, b) => b.length - a.length)
    for (const name of names) {
      const word = escapeRegex(name)
      // "Leo's birthday" keeps the name in the title; "for Leo" and a bare
      // "Leo" are taken out of it; "with Sam" stays readable.
      const possessive = new RegExp(`(^|\\s)${word}['’]s(?=\\s)`, 'i')
      const withName = new RegExp(`\\swith ${word}(?=\\s)`, 'i')
      const bare = new RegExp(`(\\s(?:for|and)\\s+|\\s)${word}(?=[\\s,])`, 'i')
      if (possessive.test(rest) || withName.test(rest)) {
        if (!chosen.includes(person.id)) chosen.push(person.id)
        break
      }
      if (take(bare)) {
        if (!chosen.includes(person.id)) chosen.push(person.id)
        break
      }
    }
  }

  // ── How it repeats ────────────────────────────────────────────────────────
  let repeat: EventRepeat = 'none'
  let repeatDay: number | null = null
  const every = take(
    new RegExp(
      `\\s(?:every|each)\\s+(?:(day|week|fortnight|other week|two weeks|month|year)|${WEEKDAY}s?)(?=\\s)`,
      'i',
    ),
  )
  if (every) {
    const unit = every[1]?.toLowerCase()
    if (unit) {
      repeat =
        unit === 'day'
          ? 'daily'
          : unit === 'week'
            ? 'weekly'
            : unit === 'month'
              ? 'monthly'
              : unit === 'year'
                ? 'yearly'
                : 'fortnightly'
    } else if (every[2]) {
      repeat = 'weekly'
      repeatDay = weekdayIndex(every[2])
    }
  } else {
    const adverb = take(/\s(daily|weekly|fortnightly|monthly|yearly|annually)(?=\s)/i)
    if (adverb?.[1]) {
      const word = adverb[1].toLowerCase()
      repeat = word === 'annually' ? 'yearly' : (word as EventRepeat)
    }
  }

  // ── When: times ───────────────────────────────────────────────────────────
  let startTime: string | null = null
  let endTime: string | null = null
  const evening = EVENING.test(text)

  // Several days: "Oct 13-17", "13-17 October" (before times, which look alike).
  let endsOn: string | null = null
  let startsOn: string | null = null
  const monthRange = take(
    new RegExp(
      `\\s(?:from\\s+)?${MONTH}\\s+(\\d{1,2})\\s*(?:-|–|to|until)\\s*(\\d{1,2})(?=[\\s,])`,
      'i',
    ),
  )
  const rangeMonth = monthRange
    ? null
    : take(
        new RegExp(
          `\\s(?:from\\s+)?(\\d{1,2})\\s*(?:-|–|to|until)\\s*(\\d{1,2})\\s+${MONTH}(?=[\\s,])`,
          'i',
        ),
      )
  const span = monthRange
    ? { month: monthRange[1], from: monthRange[2], to: monthRange[3] }
    : rangeMonth
      ? { month: rangeMonth[3], from: rangeMonth[1], to: rangeMonth[2] }
      : null
  if (span?.month && span.from && span.to) {
    const month = MONTHS.indexOf(span.month.slice(0, 3).toLowerCase()) + 1
    const first = upcoming(today, month, Number(span.from))
    const last = first ? validDate(Number(first.slice(0, 4)), month, Number(span.to)) : null
    if (first && last && last > first) {
      startsOn = first
      endsOn = last
    }
  }

  const range = take(
    /\s(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?=\s)/i,
  )
  if (range) {
    const endMeridiem = range[6]?.toLowerCase()
    const startMeridiem = range[3]?.toLowerCase() ?? endMeridiem
    const end = clock(Number(range[4]), Number(range[5] ?? 0), endMeridiem, { evening })
    let start = clock(Number(range[1]), Number(range[2] ?? 0), startMeridiem, { evening })
    // "11-1pm": the start is the morning.
    if (start && end && start > end && !range[3]) {
      start = clock(Number(range[1]), Number(range[2] ?? 0), 'am')
    }
    if (start && end && end >= start) {
      startTime = start
      endTime = end
    }
  }
  if (!startTime) {
    const noon = take(/\s(?:at\s+)?(noon|midday|midnight)(?=\s)/i)
    if (noon?.[1]) startTime = noon[1].toLowerCase() === 'midnight' ? '00:00' : '12:00'
  }
  if (!startTime) {
    const withMeridiem = take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?=\s)/i)
    const twentyFour = withMeridiem ? null : take(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/i)
    const bareAt = withMeridiem || twentyFour ? null : take(/\sat\s+(\d{1,2})(?=\s)/i)
    if (withMeridiem) {
      startTime = clock(
        Number(withMeridiem[1]),
        Number(withMeridiem[2] ?? 0),
        withMeridiem[3]?.toLowerCase(),
      )
    } else if (twentyFour) {
      startTime = clock(Number(twentyFour[1]), Number(twentyFour[2]), undefined, {
        guess: false,
        evening,
      })
    } else if (bareAt) {
      startTime = clock(Number(bareAt[1]), 0, undefined, { evening })
    }
  }
  take(/\sall[- ]day(?=\s)/i)

  // ── When: the day ─────────────────────────────────────────────────────────
  const relative = take(/\s(today|tonight|tomorrow|day after tomorrow)(?=\s)/i)
  if (!startsOn && relative?.[1]) {
    const word = relative[1].toLowerCase()
    startsOn = addDays(today, word === 'tomorrow' ? 1 : word === 'day after tomorrow' ? 2 : 0)
  }
  if (!startsOn) {
    const inDays = take(/\sin\s+(\d{1,3})\s+(day|days|week|weeks)(?=\s)/i)
    if (inDays?.[1] && inDays[2]) {
      startsOn = addDays(today, Number(inDays[1]) * (inDays[2].startsWith('week') ? 7 : 1))
    }
  }
  if (!startsOn) {
    const dayMonth = take(
      new RegExp(
        `\\s(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}(?:\\s+(\\d{4}))?(?=[\\s,])`,
        'i',
      ),
    )
    const monthDay = dayMonth
      ? null
      : take(
          new RegExp(
            `\\s(?:on\\s+)?${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?=[\\s,])`,
            'i',
          ),
        )
    if (dayMonth?.[1] && dayMonth[2]) {
      startsOn = upcoming(
        today,
        MONTHS.indexOf(dayMonth[2].slice(0, 3).toLowerCase()) + 1,
        Number(dayMonth[1]),
        dayMonth[3] ? Number(dayMonth[3]) : undefined,
      )
    } else if (monthDay?.[1] && monthDay[2]) {
      startsOn = upcoming(
        today,
        MONTHS.indexOf(monthDay[1].slice(0, 3).toLowerCase()) + 1,
        Number(monthDay[2]),
        monthDay[3] ? Number(monthDay[3]) : undefined,
      )
    }
  }
  if (!startsOn) {
    const weekday = take(new RegExp(`\\s(?:on\\s+)?(next\\s+|this\\s+)?${WEEKDAY}(?=[\\s,])`, 'i'))
    if (weekday?.[2]) {
      startsOn = nextWeekday(
        today,
        weekdayIndex(weekday[2]),
        Boolean(weekday[1]?.startsWith('next')),
      )
    }
  }
  if (!startsOn) {
    const nth = take(/\s(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)(?=\s)/i)
    if (nth?.[1]) {
      const day = Number(nth[1])
      const [y, m] = today.split('-').map(Number) as [number, number]
      const thisMonth = validDate(y, m, day)
      startsOn =
        thisMonth && thisMonth >= today
          ? thisMonth
          : validDate(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, day)
    }
  }
  if (!startsOn && repeatDay) startsOn = nextWeekday(today, repeatDay)
  startsOn ??= today

  // ── What's left is the title ──────────────────────────────────────────────
  let title = rest
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
    .replace(/^(?:on|at|for|from|every|the|and)\s+/i, '')
    .replace(/\s+(?:on|at|for|from|every|the|and)$/i, '')
    .trim()
  if (!title) return null
  title = title.charAt(0).toUpperCase() + title.slice(1)

  // A repeat can't overlap the next one: a several-day event doesn't repeat daily.
  if (endsOn && repeat === 'daily') repeat = 'none'
  return {
    title: title.slice(0, 120),
    startsOn,
    endsOn,
    startTime,
    endTime,
    repeat,
    people: chosen,
  }
}
