import { Constants } from '@households/db'
import { z } from 'zod'

import { listVisibilitySchema, type ListVisibility } from '../lists/schemas'
import type { MealSlot } from '../meals/schemas'
import { daysBetween, type EventRepeat } from './occurrences'

// Shared calendar. Events have the same audiences as lists; the database
// (calendar migration) is the authority, these give forms and the API the
// same rules.

export const EVENT_REPEATS = Constants.public.Enums.event_repeat

export const EVENT_REPEAT_LABELS: Record<EventRepeat, string> = {
  none: 'Doesn’t repeat',
  daily: 'Every day',
  weekly: 'Every week',
  fortnightly: 'Every two weeks',
  monthly: 'Every month',
  yearly: 'Every year',
}

/** When to be reminded: timed events. */
export const EVENT_REMINDER_OPTIONS = [
  { minutes: 0, label: 'At the time' },
  { minutes: 10, label: '10 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 1440, label: '1 day before' },
  { minutes: 10080, label: '1 week before' },
] as const

/** When to be reminded: all-day events (counted from 09:00 on the day). */
export const ALL_DAY_REMINDER_OPTIONS = [
  { minutes: 0, label: 'On the day, 9:00' },
  { minutes: 1440, label: 'The day before' },
  { minutes: 10080, label: 'A week before' },
] as const

/** Longest an event can last, in days after its first. */
export const MAX_EVENT_DAYS = 31
/** Longest range the calendar loads at once. */
export const MAX_CALENDAR_RANGE_DAYS = 62

/** True for IANA time zones this device knows ("Africa/Cairo"). */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** This device's time zone, e.g. "Africa/Cairo". */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

const dateSchema = z.iso.date({ error: 'Choose a real date.' })
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:30.')

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .transform((value) => value || null)
    .nullable()

const timeZoneSchema = z
  .string()
  .max(64)
  .regex(/^[A-Za-z0-9_+-]+(\/[A-Za-z0-9_+-]+)*$/, 'Choose a real time zone.')
  .refine(isTimeZone, 'Choose a real time zone.')

const REPEAT_SPAN: Partial<Record<EventRepeat, number>> = { daily: 1, weekly: 7, fortnightly: 14 }

export const eventInputSchema = z
  .strictObject({
    title: z.string().trim().min(1, 'Give it a name.').max(120, 'Use at most 120 characters.'),
    notes: optionalText(1000).optional(),
    location: optionalText(200).optional(),
    startsOn: dateSchema,
    /** Leave out for a one-day event. */
    endsOn: dateSchema.nullable().optional(),
    /** Leave out for all day. */
    startTime: timeSchema.nullable().optional(),
    endTime: timeSchema.nullable().optional(),
    timeZone: timeZoneSchema,
    repeat: z.enum(EVENT_REPEATS),
    repeatUntil: dateSchema.nullable().optional(),
    /** Who it's for. */
    people: z.array(z.uuid()).max(20, 'Choose up to 20 people.'),
    visibility: listVisibilitySchema,
    sharedWith: z.array(z.uuid()).max(100, 'That’s too many people.'),
    /** Minutes before it starts (all day: before 09:00 on the first day). */
    reminders: z
      .array(z.number().int().min(0).max(40320))
      .max(5, 'Choose up to five reminders.')
      .optional(),
  })
  .superRefine((input, ctx) => {
    const endsOn = input.endsOn ?? input.startsOn
    const days = daysBetween(input.startsOn, endsOn)
    if (days < 0) {
      ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'End on or after the start.' })
    } else if (days > MAX_EVENT_DAYS) {
      ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'Keep it to a month or less.' })
    }
    if (input.endTime && !input.startTime) {
      ctx.addIssue({ code: 'custom', path: ['startTime'], message: 'Add a start time too.' })
    }
    if (input.startTime && input.endTime && days === 0 && input.endTime < input.startTime) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'End after it starts.' })
    }
    const span = REPEAT_SPAN[input.repeat]
    if (span !== undefined && days >= span) {
      ctx.addIssue({
        code: 'custom',
        path: ['repeat'],
        message: 'It would overlap the next one. Make it shorter or repeat less often.',
      })
    }
    if (input.repeatUntil) {
      if (input.repeat === 'none') {
        ctx.addIssue({ code: 'custom', path: ['repeatUntil'], message: 'Choose how it repeats.' })
      } else if (input.repeatUntil < input.startsOn) {
        ctx.addIssue({ code: 'custom', path: ['repeatUntil'], message: 'End after the start.' })
      }
    }
    if (input.visibility === 'selected_members' && input.sharedWith.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['sharedWith'], message: 'Choose at least one person.' })
    }
    if (new Set(input.people).size !== input.people.length) {
      ctx.addIssue({ code: 'custom', path: ['people'], message: 'Choose each person once.' })
    }
  })
export type EventInput = z.input<typeof eventInputSchema>

/** Cancels one time a repeating event happens. */
export const skipOccurrenceInputSchema = z.strictObject({ date: dateSchema })

export const calendarRangeSchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine(
    ({ from, to }) => to >= from && daysBetween(from, to) <= MAX_CALENDAR_RANGE_DAYS,
    `Load at most ${MAX_CALENDAR_RANGE_DAYS} days at a time.`,
  )

export interface CalendarEvent {
  id: string
  title: string
  notes: string | null
  location: string | null
  startsOn: string
  endsOn: string
  /** "HH:MM", or null for all day. */
  startTime: string | null
  endTime: string | null
  timeZone: string
  repeat: EventRepeat
  repeatUntil: string | null
  skippedOn: string[]
  people: string[]
  visibility: ListVisibility
  sharedWith: string[]
  /** Minutes before it starts. */
  reminders: number[]
  createdBy: string | null
  /** Whether the viewer may edit or delete it. */
  canEdit: boolean
}

/** Something on a day: an event, or things from lists, chores and meals. */
export type CalendarEntry =
  | { kind: 'event'; key: string; date: string; endDate: string; eventId: string }
  | {
      kind: 'due'
      key: string
      date: string
      listId: string
      listTitle: string
      itemId: string
      text: string
      assignedTo: string | null
    }
  | {
      kind: 'chore'
      key: string
      date: string
      choreId: string
      title: string
      assignedTo: string | null
    }
  | { kind: 'meal'; key: string; date: string; entryId: string; title: string; slot: MealSlot }

export interface CalendarView {
  from: string
  to: string
  events: CalendarEvent[]
  entries: CalendarEntry[]
  canAdd: boolean
}
