import { describe, expect, it } from 'vitest'

import { eventIcs } from './ics'
import { parseQuickEvent } from './quick-add'

// 2026-10-04 is a Sunday.
const TODAY = '2026-10-04'
const PEOPLE = [
  { id: 'leo', name: 'Leo' },
  { id: 'maya', name: 'Maya Lopez' },
  { id: 'sam', name: 'Sam Lopez' },
]
const parse = (text: string) => parseQuickEvent(text, TODAY, PEOPLE)

describe('parseQuickEvent', () => {
  it('reads who, what, the day and the time', () => {
    expect(parse('Leo dentist Friday at noon')).toEqual({
      title: 'Dentist',
      startsOn: '2026-10-09',
      endsOn: null,
      startTime: '12:00',
      endTime: null,
      repeat: 'none',
      people: ['leo'],
    })
  })

  it('reads repeats on a weekday, and "for" someone', () => {
    expect(parse('Swim lesson every Tuesday 5pm for Leo')).toMatchObject({
      title: 'Swim lesson',
      startsOn: '2026-10-06',
      startTime: '17:00',
      repeat: 'weekly',
      people: ['leo'],
    })
  })

  it('reads dates and time ranges', () => {
    expect(parse("Parents' evening 6 Oct 18:30-20:00")).toMatchObject({
      title: "Parents' evening",
      startsOn: '2026-10-06',
      startTime: '18:30',
      endTime: '20:00',
    })
    expect(parse('3-4pm piano')).toMatchObject({
      title: 'Piano',
      startsOn: TODAY,
      startTime: '15:00',
      endTime: '16:00',
    })
  })

  it('keeps a name that belongs in the title', () => {
    expect(parse("Leo's birthday March 3 every year")).toMatchObject({
      title: "Leo's birthday",
      startsOn: '2027-03-03',
      startTime: null,
      repeat: 'yearly',
      people: ['leo'],
    })
    expect(parse('Lunch with Sam at 1')).toMatchObject({
      title: 'Lunch with Sam',
      startTime: '13:00',
      people: ['sam'],
    })
  })

  it('reads relative days', () => {
    expect(parse('Bins out tomorrow')).toMatchObject({ startsOn: '2026-10-05', startTime: null })
    expect(parse('Call grandma in 3 days at 9am')).toMatchObject({
      startsOn: '2026-10-07',
      startTime: '09:00',
    })
    expect(parse('Haircut next monday')).toMatchObject({ startsOn: '2026-10-05' })
    expect(parse('Dinner at 7')).toMatchObject({ startTime: '19:00' })
  })

  it('reads trips over several days', () => {
    expect(parse('Rome trip Oct 13-17')).toMatchObject({
      title: 'Rome trip',
      startsOn: '2026-10-13',
      endsOn: '2026-10-17',
      startTime: null,
    })
  })

  it("doesn't mistake words for months", () => {
    expect(parse('Farmers market 6pm')).toMatchObject({
      title: 'Farmers market',
      startsOn: TODAY,
      startTime: '18:00',
    })
  })

  it('needs something to call it', () => {
    expect(parse('')).toBeNull()
    expect(parse('tomorrow at 5')).toBeNull()
  })
})

describe('eventIcs', () => {
  const base = {
    id: 'e1',
    title: 'Dentist, check-up',
    notes: 'Bring the card;\nask about braces',
    location: null,
    startsOn: '2026-10-06',
    endsOn: '2026-10-06',
    startTime: '15:30',
    endTime: '16:00',
    timeZone: 'Africa/Cairo',
    repeat: 'none' as const,
    repeatUntil: null,
    skippedOn: [],
  }
  const now = new Date('2026-10-04T08:00:00Z')

  it('writes a timed event in its time zone, escaping text', () => {
    const ics = eventIcs(base, now)
    expect(ics).toContain('DTSTART;TZID=Africa/Cairo:20261006T153000')
    expect(ics).toContain('DTEND;TZID=Africa/Cairo:20261006T160000')
    expect(ics).toContain('SUMMARY:Dentist\\, check-up')
    expect(ics).toContain('DESCRIPTION:Bring the card\\;\\nask about braces')
    expect(ics).toContain('UID:e1@households.xyz')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('writes all-day repeats with their skipped days', () => {
    const ics = eventIcs(
      {
        ...base,
        startTime: null,
        endTime: null,
        repeat: 'fortnightly',
        repeatUntil: '2026-12-31',
        skippedOn: ['2026-10-20'],
      },
      now,
    )
    expect(ics).toContain('DTSTART;VALUE=DATE:20261006')
    expect(ics).toContain('DTEND;VALUE=DATE:20261007')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261231')
    expect(ics).toContain('EXDATE;VALUE=DATE:20261020')
  })
})
