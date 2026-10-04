import { describe, expect, it } from 'vitest'

import { daysBetween, eventOccurrences, type EventSchedule } from './occurrences'
import { eventInputSchema, isTimeZone } from './schemas'

const once = (startsOn: string, endsOn = startsOn): EventSchedule => ({
  startsOn,
  endsOn,
  repeat: 'none',
  repeatUntil: null,
  skippedOn: [],
})

const dates = (schedule: EventSchedule, from: string, to: string) =>
  eventOccurrences(schedule, from, to).map((o) => o.date)

describe('daysBetween', () => {
  it('counts calendar days, across months and leap years', () => {
    expect(daysBetween('2026-10-01', '2026-10-01')).toBe(0)
    expect(daysBetween('2026-09-28', '2026-10-05')).toBe(7)
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
    expect(daysBetween('2026-10-05', '2026-10-01')).toBe(-4)
  })
})

describe('eventOccurrences', () => {
  it('finds a one-off event only in a range it overlaps', () => {
    expect(dates(once('2026-10-06'), '2026-10-01', '2026-10-31')).toEqual(['2026-10-06'])
    expect(dates(once('2026-10-06'), '2026-11-01', '2026-11-30')).toEqual([])
  })

  it('includes multi-day events that started before the range', () => {
    expect(eventOccurrences(once('2026-09-29', '2026-10-02'), '2026-10-01', '2026-10-31')).toEqual([
      { date: '2026-09-29', endDate: '2026-10-02' },
    ])
  })

  it('repeats weekly and fortnightly from the first date, even years later', () => {
    const swim: EventSchedule = { ...once('2024-01-02'), repeat: 'weekly' }
    expect(dates(swim, '2026-10-01', '2026-10-21')).toEqual([
      '2026-10-06',
      '2026-10-13',
      '2026-10-20',
    ])
    const bins: EventSchedule = { ...once('2026-09-29'), repeat: 'fortnightly' }
    expect(dates(bins, '2026-10-01', '2026-10-31')).toEqual(['2026-10-13', '2026-10-27'])
  })

  it('repeats monthly on the same date, skipping months without it', () => {
    const rent: EventSchedule = { ...once('2026-01-31'), repeat: 'monthly' }
    expect(dates(rent, '2026-01-01', '2026-07-31')).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
      '2026-07-31',
    ])
  })

  it('repeats yearly, with 29 February only in leap years', () => {
    const birthday: EventSchedule = { ...once('2024-02-29'), repeat: 'yearly' }
    expect(dates(birthday, '2025-01-01', '2028-12-31')).toEqual(['2028-02-29'])
  })

  it('stops at the end date and leaves out skipped days', () => {
    const lessons: EventSchedule = {
      ...once('2026-10-01'),
      repeat: 'daily',
      repeatUntil: '2026-10-05',
      skippedOn: ['2026-10-03'],
    }
    expect(dates(lessons, '2026-09-01', '2026-12-31')).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-04',
      '2026-10-05',
    ])
  })

  it('stays cheap for long-running daily events', () => {
    const daily: EventSchedule = { ...once('2000-01-01'), repeat: 'daily' }
    expect(dates(daily, '2026-10-01', '2026-10-03')).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ])
  })
})

describe('eventInputSchema', () => {
  const valid = {
    title: 'Dentist',
    startsOn: '2026-10-06',
    startTime: '15:30',
    endTime: '16:00',
    timeZone: 'Africa/Cairo',
    repeat: 'none',
    people: [],
    visibility: 'household',
    sharedWith: [],
  } as const

  it('accepts a normal event', () => {
    expect(eventInputSchema.safeParse(valid).success).toBe(true)
  })

  it.each([
    ['ends before it starts', { endsOn: '2026-10-05' }],
    ['an end time before the start', { endTime: '15:00' }],
    ['an end time without a start', { startTime: null }],
    ['a weekly event longer than a week', { endsOn: '2026-10-14', repeat: 'weekly' }],
    ['an end date without a repeat', { repeatUntil: '2026-12-01' }],
    ['an unknown time zone', { timeZone: 'Mars/Olympus' }],
    ['nobody chosen to share with', { visibility: 'selected_members' }],
  ])('rejects %s', (_label, change) => {
    expect(eventInputSchema.safeParse({ ...valid, ...change }).success).toBe(false)
  })

  it('knows real time zones', () => {
    expect(isTimeZone('America/Los_Angeles')).toBe(true)
    expect(isTimeZone('Nowhere/Special')).toBe(false)
  })
})
