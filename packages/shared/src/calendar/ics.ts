import { addDays } from '../chores/periods'
import type { CalendarEvent } from './schemas'

// "Add to my calendar": one event as an iCalendar (.ics) file, made on the
// device. Nothing is sent anywhere; the person's own calendar app opens it.

type IcsEvent = Pick<
  CalendarEvent,
  | 'id'
  | 'title'
  | 'notes'
  | 'location'
  | 'startsOn'
  | 'endsOn'
  | 'startTime'
  | 'endTime'
  | 'timeZone'
  | 'repeat'
  | 'repeatUntil'
  | 'skippedOn'
>

const compact = (day: string) => day.replace(/-/g, '')
const compactTime = (time: string) => `${time.replace(':', '')}00`

/** RFC 5545 text: backslashes, commas, semicolons and new lines escaped. */
function text(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Lines longer than 75 characters continue on the next, indented. */
function fold(line: string): string {
  const parts: string[] = []
  for (let i = 0; i < line.length; i += 73) parts.push(line.slice(i, i + 73))
  return parts.join('\r\n ')
}

function addHour(time: string): string {
  const [h, m] = time.split(':').map(Number) as [number, number]
  return `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const RRULE: Partial<Record<CalendarEvent['repeat'], string>> = {
  daily: 'FREQ=DAILY',
  weekly: 'FREQ=WEEKLY',
  fortnightly: 'FREQ=WEEKLY;INTERVAL=2',
  monthly: 'FREQ=MONTHLY',
  yearly: 'FREQ=YEARLY',
}

/** The whole event (with its repeats) as an .ics file's text. */
export function eventIcs(event: IcsEvent, now: Date = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Households.xyz//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}@households.xyz`,
    `DTSTAMP:${stamp}`,
  ]

  if (event.startTime) {
    const zone = `TZID=${event.timeZone}`
    const end = event.endTime ?? addHour(event.startTime)
    lines.push(`DTSTART;${zone}:${compact(event.startsOn)}T${compactTime(event.startTime)}`)
    lines.push(`DTEND;${zone}:${compact(event.endsOn)}T${compactTime(end)}`)
  } else {
    // All-day events end the morning after their last day.
    lines.push(`DTSTART;VALUE=DATE:${compact(event.startsOn)}`)
    lines.push(`DTEND;VALUE=DATE:${compact(addDays(event.endsOn, 1))}`)
  }

  const rule = RRULE[event.repeat]
  if (rule) {
    const until = event.repeatUntil
      ? event.startTime
        ? `;UNTIL=${compact(event.repeatUntil)}T235959Z`
        : `;UNTIL=${compact(event.repeatUntil)}`
      : ''
    lines.push(`RRULE:${rule}${until}`)
    for (const day of event.skippedOn) {
      lines.push(
        event.startTime
          ? `EXDATE;TZID=${event.timeZone}:${compact(day)}T${compactTime(event.startTime)}`
          : `EXDATE;VALUE=DATE:${compact(day)}`,
      )
    }
  }

  lines.push(`SUMMARY:${text(event.title)}`)
  if (event.location) lines.push(`LOCATION:${text(event.location)}`)
  if (event.notes) lines.push(`DESCRIPTION:${text(event.notes)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return `${lines.map(fold).join('\r\n')}\r\n`
}
