import { describe, expect, it } from 'vitest'

import {
  addDays,
  choreAssignee,
  chorePeriodIndex,
  chorePeriodStart,
  currentStreak,
  isChoreOn,
  isoWeekday,
  localDate,
} from './periods'

describe('chorePeriodStart', () => {
  // Same fixtures as the database test ("periods: weeks start on Monday…"),
  // so the app and private.chore_period_start agree.
  it.each([
    ['daily', '2026-10-01', '2026-10-01'],
    ['weekly', '2026-10-01', '2026-09-28'],
    ['weekly', '2026-10-04', '2026-09-28'],
    ['weekly', '2026-10-05', '2026-10-05'],
    ['monthly', '2026-10-31', '2026-10-01'],
    ['once', '2026-10-31', '2026-01-15'],
  ] as const)('%s on %s starts %s', (repeat, day, start) => {
    expect(chorePeriodStart(repeat, day, '2026-01-15')).toBe(start)
  })

  it('handles leap days and year ends', () => {
    expect(chorePeriodStart('weekly', '2028-02-29', '2028-01-01')).toBe('2028-02-28')
    expect(chorePeriodStart('weekly', '2027-01-01', '2026-01-01')).toBe('2026-12-28')
  })
})

describe('turns', () => {
  // Same fixtures as the database test ("turns: periods are counted…").
  it.each([
    ['daily', '2000-01-03', 0],
    ['daily', '2026-10-01', 9768],
    ['weekly', '2026-09-28', 1395],
    ['monthly', '2026-10-01', 321],
    ['once', '2026-10-01', 0],
  ] as const)('%s period starting %s is number %i', (repeat, start, index) => {
    expect(chorePeriodIndex(repeat, start)).toBe(index)
  })

  it('go round in order, one person per period', () => {
    const chore = {
      repeat: 'daily',
      assignedTo: null,
      rotation: ['a', 'b', 'c'],
      weekdays: null,
    } as const
    const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']
    const turns = days.map((day) => choreAssignee(chore, day))
    expect(new Set(turns.slice(0, 3)).size).toBe(3)
    expect(turns[3]).toBe(turns[0])
  })

  it('fall back to the fixed assignee without a rotation', () => {
    expect(
      choreAssignee(
        { repeat: 'weekly', assignedTo: 'x', rotation: null, weekdays: null },
        '2026-09-28',
      ),
    ).toBe('x')
  })
})

describe('weekdays', () => {
  it('limit daily chores to the chosen days', () => {
    const weekdaysOnly = {
      repeat: 'daily',
      assignedTo: null,
      rotation: null,
      weekdays: [1, 2, 3, 4, 5],
    } as const
    expect(isChoreOn(weekdaysOnly, '2026-10-02')).toBe(true) // Friday
    expect(isChoreOn(weekdaysOnly, '2026-10-03')).toBe(false) // Saturday
    expect(isoWeekday('2026-10-04')).toBe(7)
  })
})

describe('dates', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it("formats the device's own calendar date", () => {
    expect(localDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })
})

describe('currentStreak', () => {
  it('counts back from today', () => {
    expect(currentStreak(['2026-10-01', '2026-09-30', '2026-09-29'], '2026-10-01')).toBe(3)
  })

  it("keeps yesterday's streak until today is over", () => {
    expect(currentStreak(['2026-09-30', '2026-09-29'], '2026-10-01')).toBe(2)
  })

  it('breaks on a missed day', () => {
    expect(currentStreak(['2026-10-01', '2026-09-29'], '2026-10-01')).toBe(1)
    expect(currentStreak(['2026-09-28'], '2026-10-01')).toBe(0)
  })
})
