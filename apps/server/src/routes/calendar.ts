import {
  ApiError,
  calendarRangeSchema,
  eventInputSchema,
  eventOccurrences,
  skipOccurrenceInputSchema,
  type CalendarEntry,
  type CalendarEvent,
  type CalendarView,
} from '@households/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

import { toApiError } from '../lib/errors'
import { validationHook } from '../lib/validation'
import type { AppEnv } from '../types'

// Mounted at /v1/households/:id/calendar. Every query runs as the user, so
// RLS decides which events (and list items, chores, meals) they see.

const householdParam = zValidator('param', z.object({ id: z.uuid() }), validationHook)
const eventParam = zValidator(
  'param',
  z.object({ id: z.uuid(), eventId: z.uuid() }),
  validationHook,
)

const EVENT_FIELDS =
  'id, title, notes, location, starts_on, ends_on, start_time, end_time, time_zone, repeat, repeat_until, skipped_on, people, visibility, shared_with, reminders, created_by'

/** "15:30:00" → "15:30". */
const hhmm = (time: string | null) => (time ? time.slice(0, 5) : null)

function toRow(input: z.output<typeof eventInputSchema>) {
  return {
    title: input.title,
    notes: input.notes ?? null,
    location: input.location ?? null,
    starts_on: input.startsOn,
    ends_on: input.endsOn ?? input.startsOn,
    start_time: input.startTime ?? null,
    end_time: input.startTime ? (input.endTime ?? null) : null,
    time_zone: input.timeZone,
    repeat: input.repeat,
    repeat_until: input.repeat === 'none' ? null : (input.repeatUntil ?? null),
    people: input.people,
    visibility: input.visibility,
    shared_with: input.visibility === 'selected_members' ? input.sharedWith : [],
    reminders: input.reminders ?? [],
  }
}

const notFound = () => new ApiError('NOT_FOUND')

export const calendarRoutes = new Hono<AppEnv>()
  // Everything on the calendar between two dates: events (repeats expanded),
  // list items due, one-off chores due, and planned meals.
  .get('/', householdParam, zValidator('query', calendarRangeSchema, validationHook), async (c) => {
    const { id } = c.req.valid('param')
    const { from, to } = c.req.valid('query')
    const db = c.var.supabase
    const me = c.var.auth.userId

    const [membership, events, items, chores, meals, permissions] = await Promise.all([
      db
        .from('household_members')
        .select('role')
        .eq('household_id', id)
        .eq('profile_id', me)
        .eq('status', 'active')
        .maybeSingle(),
      db
        .from('events')
        .select(EVENT_FIELDS)
        .eq('household_id', id)
        .lte('starts_on', to)
        .or(`repeat.neq.none,ends_on.gte.${from}`)
        .order('starts_on', { ascending: true })
        .limit(2000),
      db
        .from('list_items')
        .select('id, list_id, text, due_on, assigned_to, list:lists!inner(title, archived_at)')
        .eq('household_id', id)
        .is('done_at', null)
        .is('list.archived_at', null)
        .gte('due_on', from)
        .lte('due_on', to)
        .limit(500),
      db
        .from('chores')
        .select('id, title, due_on, assigned_to')
        .eq('household_id', id)
        .eq('repeat', 'once')
        .is('archived_at', null)
        .gte('due_on', from)
        .lte('due_on', to)
        .limit(500),
      db
        .from('meal_plan_entries')
        .select('id, on_date, slot, title, recipe_id')
        .eq('household_id', id)
        .gte('on_date', from)
        .lte('on_date', to)
        .limit(1000),
      db.rpc('my_household_permissions', { p_household_id: id }),
    ])
    for (const result of [membership, events, items, chores, meals, permissions]) {
      if (result.error) throw toApiError(result.error)
    }
    if (!membership.data) throw notFound()

    const can = new Set(permissions.data ?? [])
    const calendarEvents: CalendarEvent[] = (events.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      notes: row.notes,
      location: row.location,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      startTime: hhmm(row.start_time),
      endTime: hhmm(row.end_time),
      timeZone: row.time_zone,
      repeat: row.repeat,
      repeatUntil: row.repeat_until,
      skippedOn: row.skipped_on,
      people: row.people,
      visibility: row.visibility as CalendarEvent['visibility'],
      sharedWith: row.shared_with,
      reminders: row.reminders,
      createdBy: row.created_by,
      canEdit:
        row.created_by === me || (row.visibility === 'household' && can.has('manage_calendar')),
    }))

    const entries: CalendarEntry[] = []
    for (const event of calendarEvents) {
      for (const occurrence of eventOccurrences(event, from, to)) {
        entries.push({
          kind: 'event',
          key: `event:${event.id}:${occurrence.date}`,
          date: occurrence.date,
          endDate: occurrence.endDate,
          eventId: event.id,
        })
      }
    }
    for (const item of items.data ?? []) {
      if (!item.due_on) continue
      entries.push({
        kind: 'due',
        key: `due:${item.id}`,
        date: item.due_on,
        listId: item.list_id,
        listTitle: item.list.title,
        itemId: item.id,
        text: item.text,
        assignedTo: item.assigned_to,
      })
    }

    // One-off chores that are done (or waiting for approval) are off the calendar.
    const choreRows = chores.data ?? []
    const done = new Set<string>()
    if (choreRows.length > 0) {
      const { data, error } = await db
        .from('chore_completions')
        .select('chore_id')
        .in(
          'chore_id',
          choreRows.map((chore) => chore.id),
        )
        .neq('status', 'rejected')
      if (error) throw toApiError(error)
      for (const row of data) done.add(row.chore_id)
    }
    for (const chore of choreRows) {
      if (!chore.due_on || done.has(chore.id)) continue
      entries.push({
        kind: 'chore',
        key: `chore:${chore.id}`,
        date: chore.due_on,
        choreId: chore.id,
        title: chore.title,
        assignedTo: chore.assigned_to,
      })
    }

    const mealRows = meals.data ?? []
    const recipeIds = [...new Set(mealRows.flatMap((meal) => meal.recipe_id ?? []))]
    const recipeTitles = new Map<string, string>()
    if (recipeIds.length > 0) {
      const { data, error } = await db.from('recipes').select('id, title').in('id', recipeIds)
      if (error) throw toApiError(error)
      for (const recipe of data) recipeTitles.set(recipe.id, recipe.title)
    }
    for (const meal of mealRows) {
      entries.push({
        kind: 'meal',
        key: `meal:${meal.id}`,
        date: meal.on_date,
        entryId: meal.id,
        title: meal.title ?? (meal.recipe_id && recipeTitles.get(meal.recipe_id)) ?? 'A meal',
        slot: meal.slot,
      })
    }

    entries.sort((a, b) => a.date.localeCompare(b.date))
    const view: CalendarView = {
      from,
      to,
      events: calendarEvents,
      entries,
      canAdd: can.has('create_posts'),
    }
    return c.json(view)
  })

  .post('/', householdParam, zValidator('json', eventInputSchema, validationHook), async (c) => {
    const { id } = c.req.valid('param')
    const { data, error } = await c.var.supabase
      .from('events')
      .insert({ household_id: id, ...toRow(c.req.valid('json')) })
      .select('id')
      .single()
    if (error) throw toApiError(error)
    return c.json({ id: data.id }, 201)
  })

  .put('/:eventId', eventParam, zValidator('json', eventInputSchema, validationHook), async (c) => {
    const { id, eventId } = c.req.valid('param')
    const { data, error } = await c.var.supabase
      .from('events')
      .update(toRow(c.req.valid('json')))
      .eq('id', eventId)
      .eq('household_id', id)
      .select('id')
    if (error) throw toApiError(error)
    if (data.length === 0) throw notFound()
    return c.json({ ok: true as const })
  })

  // Cancels one time a repeating event happens.
  .post(
    '/:eventId/skip',
    eventParam,
    zValidator('json', skipOccurrenceInputSchema, validationHook),
    async (c) => {
      const { id, eventId } = c.req.valid('param')
      const db = c.var.supabase
      const { data: event, error } = await db
        .from('events')
        .select('skipped_on')
        .eq('id', eventId)
        .eq('household_id', id)
        .maybeSingle()
      if (error) throw toApiError(error)
      if (!event) throw notFound()
      const { data, error: updateError } = await db
        .from('events')
        .update({ skipped_on: [...event.skipped_on, c.req.valid('json').date] })
        .eq('id', eventId)
        .select('id')
      if (updateError) throw toApiError(updateError)
      if (data.length === 0) throw notFound()
      return c.json({ ok: true as const })
    },
  )

  .delete('/:eventId', eventParam, async (c) => {
    const { id, eventId } = c.req.valid('param')
    const { data, error } = await c.var.supabase
      .from('events')
      .delete()
      .eq('id', eventId)
      .eq('household_id', id)
      .select('id')
    if (error) throw toApiError(error)
    if (data.length === 0) throw notFound()
    return c.json({ ok: true as const })
  })
