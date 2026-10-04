import {
  ALL_DAY_REMINDER_OPTIONS,
  deviceTimeZone,
  EVENT_REMINDER_OPTIONS,
  EVENT_REPEAT_LABELS,
  EVENT_REPEATS,
  eventInputSchema,
  LIST_VISIBILITIES,
  LIST_VISIBILITY_HINTS,
  LIST_VISIBILITY_LABELS,
  type CalendarEntry,
  type CalendarEvent,
  type EventInput,
  type EventRepeat,
  type HouseholdMember,
  type ListVisibility,
  type QuickEvent,
} from '@households/shared'
import { useState, type FormEvent } from 'react'

import {
  Button,
  ChipButton,
  ChipGroup,
  ErrorText,
  Grid,
  Row,
  Select,
  Stack,
  StatusText,
  TextArea,
  TextField,
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import { formatClock } from './dates'

interface Fields {
  title: string
  startsOn: string
  endsOn: string
  startTime: string
  endTime: string
  repeat: EventRepeat
  repeatUntil: string
  location: string
  notes: string
  people: string[]
  visibility: ListVisibility
  sharedWith: string[]
  /** Minutes before the start (all day: before 9:00 on the day). */
  reminders: number[]
}

type Errors = Partial<Record<keyof Fields, string>>

function fieldsOf(event: CalendarEvent | null, day: string, draft: QuickEvent | null): Fields {
  return {
    title: event?.title ?? draft?.title ?? '',
    startsOn: event?.startsOn ?? draft?.startsOn ?? day,
    endsOn: event ? (event.endsOn !== event.startsOn ? event.endsOn : '') : (draft?.endsOn ?? ''),
    startTime: event?.startTime ?? draft?.startTime ?? '',
    endTime: event?.endTime ?? draft?.endTime ?? '',
    repeat: event?.repeat ?? draft?.repeat ?? 'none',
    repeatUntil: event?.repeatUntil ?? '',
    location: event?.location ?? '',
    notes: event?.notes ?? '',
    people: event?.people ?? draft?.people ?? [],
    visibility: event?.visibility ?? 'household',
    sharedWith: event?.sharedWith ?? [],
    reminders: event?.reminders ?? [],
  }
}

/** "13:30" → minutes after midnight. */
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

/**
 * Other events on the day for the same people that overlap in time (all-day
 * ones always do): "Leo already has Swim lesson, 5:00–5:45 PM."
 */
function clashes(
  fields: Fields,
  dayEntries: CalendarEntry[],
  events: Map<string, CalendarEvent>,
  editing: string | undefined,
): { event: CalendarEvent; who: string[] }[] {
  if (fields.people.length === 0) return []
  const start = fields.startTime ? minutes(fields.startTime) : null
  const end = fields.endTime ? minutes(fields.endTime) : start === null ? null : start + 60
  const found = new Map<string, { event: CalendarEvent; who: string[] }>()
  for (const entry of dayEntries) {
    if (entry.kind !== 'event' || entry.eventId === editing) continue
    const other = events.get(entry.eventId)
    if (!other) continue
    const who = other.people.filter((id) => fields.people.includes(id))
    if (who.length === 0) continue
    const otherStart = other.startTime ? minutes(other.startTime) : null
    const otherEnd = other.endTime
      ? minutes(other.endTime)
      : otherStart === null
        ? null
        : otherStart + 60
    const overlaps =
      start === null || otherStart === null || (start < (otherEnd ?? 0) && otherStart < (end ?? 0))
    if (overlaps) found.set(other.id, { event: other, who })
  }
  return [...found.values()]
}

/**
 * Adds or edits an event. Times are optional (all day without one); only
 * the creator chooses who can see it, and an event can only be for people
 * who can see it.
 */
export function EventForm({
  event,
  draft = null,
  day,
  byDay,
  events,
  members,
  me,
  busy,
  error,
  onSave,
  onCancel,
}: {
  event: CalendarEvent | null
  /** From quick add: what was understood so far. */
  draft?: QuickEvent | null
  day: string
  /** What's already on the calendar (for clashes). */
  byDay: Map<string, CalendarEntry[]>
  events: Map<string, CalendarEvent>
  members: HouseholdMember[]
  me: string
  busy: boolean
  error: unknown
  onSave: (input: EventInput) => Promise<void>
  onCancel: () => void
}) {
  const [fields, setFields] = useState<Fields>(() => fieldsOf(event, day, draft))
  const [errors, setErrors] = useState<Errors>({})
  const isCreator = !event || event.createdBy === me
  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setFields((current) => ({ ...current, [key]: value }))
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id]

  // Who the event can be for: whoever can see it.
  const audience = members.filter(
    (member) =>
      fields.visibility === 'household' ||
      member.profileId === (event?.createdBy ?? me) ||
      (fields.visibility === 'selected_members' && fields.sharedWith.includes(member.profileId)),
  )

  // All-day events have their own choices; others are kept but not offered.
  const reminderOptions: readonly { minutes: number; label: string }[] = fields.startTime
    ? EVENT_REMINDER_OPTIONS
    : ALL_DAY_REMINDER_OPTIONS
  const offered = (minutes: number) => reminderOptions.some((option) => option.minutes === minutes)
  const toggleReminder = (minutes: number) =>
    set(
      'reminders',
      fields.reminders.includes(minutes)
        ? fields.reminders.filter((item) => item !== minutes)
        : [...fields.reminders, minutes],
    )

  const names = new Map(members.map((member) => [member.profileId, member.displayName]))
  const conflicts = clashes(fields, byDay.get(fields.startsOn) ?? [], events, event?.id)

  async function onSubmit(submitted: FormEvent) {
    submitted.preventDefault()
    const allowed = new Set(audience.map((member) => member.profileId))
    const input: EventInput = {
      title: fields.title,
      startsOn: fields.startsOn,
      endsOn: fields.endsOn || null,
      startTime: fields.startTime || null,
      endTime: fields.startTime ? fields.endTime || null : null,
      timeZone: event?.timeZone ?? deviceTimeZone(),
      repeat: fields.repeat,
      repeatUntil: fields.repeat === 'none' ? null : fields.repeatUntil || null,
      location: fields.location,
      notes: fields.notes,
      people: fields.people.filter((id) => allowed.has(id)),
      visibility: fields.visibility,
      sharedWith: fields.visibility === 'selected_members' ? fields.sharedWith : [],
      reminders: fields.reminders.filter(offered).sort((a, b) => a - b),
    }
    const parsed = eventInputSchema.safeParse(input)
    if (!parsed.success) {
      const next: Errors = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof Fields | undefined
        if (field && !next[field]) next[field] = issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    try {
      await onSave(input)
    } catch {
      // Shown below.
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <Stack $gap={4}>
        <TextField
          label="What"
          placeholder="Dentist"
          value={fields.title}
          maxLength={120}
          onChange={(e) => set('title', e.target.value)}
          error={errors.title}
        />
        <Grid $columns={2} $gap={4}>
          <TextField
            label="Date"
            type="date"
            value={fields.startsOn}
            onChange={(e) => set('startsOn', e.target.value)}
            error={errors.startsOn}
          />
          <TextField
            label="Ends on (optional)"
            type="date"
            hint="For things that last more than a day."
            value={fields.endsOn}
            min={fields.startsOn}
            onChange={(e) => set('endsOn', e.target.value)}
            error={errors.endsOn}
          />
          <TextField
            label="Starts at (optional)"
            type="time"
            hint="Leave empty for all day."
            value={fields.startTime}
            onChange={(e) => set('startTime', e.target.value)}
            error={errors.startTime}
          />
          <TextField
            label="Ends at (optional)"
            type="time"
            value={fields.endTime}
            disabled={!fields.startTime}
            onChange={(e) => set('endTime', e.target.value)}
            error={errors.endTime}
          />
          <Select
            label="Repeats"
            value={fields.repeat}
            onChange={(e) => set('repeat', e.target.value as EventRepeat)}
            error={errors.repeat}
          >
            {EVENT_REPEATS.map((repeat) => (
              <option key={repeat} value={repeat}>
                {EVENT_REPEAT_LABELS[repeat]}
              </option>
            ))}
          </Select>
          {fields.repeat !== 'none' && (
            <TextField
              label="Until (optional)"
              type="date"
              value={fields.repeatUntil}
              min={fields.startsOn}
              onChange={(e) => set('repeatUntil', e.target.value)}
              error={errors.repeatUntil}
            />
          )}
        </Grid>
        <TextField
          label="Where (optional)"
          placeholder="Smile Dental, 12 Nile St"
          value={fields.location}
          maxLength={200}
          onChange={(e) => set('location', e.target.value)}
          error={errors.location}
        />
        <TextArea
          label="Notes (optional)"
          rows={2}
          value={fields.notes}
          maxLength={1000}
          onChange={(e) => set('notes', e.target.value)}
          error={errors.notes}
        />
        <Select
          label="Who can see it"
          value={fields.visibility}
          disabled={!isCreator}
          hint={
            isCreator
              ? LIST_VISIBILITY_HINTS[fields.visibility]
              : 'Only the person who added it can change this.'
          }
          onChange={(e) => set('visibility', e.target.value as ListVisibility)}
        >
          {LIST_VISIBILITIES.map((visibility) => (
            <option key={visibility} value={visibility}>
              {LIST_VISIBILITY_LABELS[visibility]}
            </option>
          ))}
        </Select>
        {fields.visibility === 'selected_members' && isCreator && (
          <ChipGroup label="Shared with" error={errors.sharedWith}>
            {members
              .filter((member) => member.profileId !== me)
              .map((member) => (
                <ChipButton
                  key={member.profileId}
                  pressed={fields.sharedWith.includes(member.profileId)}
                  onClick={() => set('sharedWith', toggle(fields.sharedWith, member.profileId))}
                >
                  {member.displayName}
                </ChipButton>
              ))}
          </ChipGroup>
        )}
        {audience.length > 1 && (
          <ChipGroup
            label="Who it’s for (optional)"
            hint="They’ll get a notification."
            error={errors.people}
          >
            {audience.map((member) => (
              <ChipButton
                key={member.profileId}
                pressed={fields.people.includes(member.profileId)}
                onClick={() => set('people', toggle(fields.people, member.profileId))}
              >
                {member.isMe ? `${member.displayName} (you)` : member.displayName}
              </ChipButton>
            ))}
          </ChipGroup>
        )}
        <ChipGroup
          label="Remind (optional)"
          hint={
            fields.people.length > 0
              ? 'Reminders go to the people it’s for.'
              : 'Reminders go to you. Choose who it’s for to remind them instead.'
          }
          error={errors.reminders}
        >
          {reminderOptions.map((option) => (
            <ChipButton
              key={option.minutes}
              pressed={fields.reminders.includes(option.minutes)}
              onClick={() => toggleReminder(option.minutes)}
            >
              {option.label}
            </ChipButton>
          ))}
        </ChipGroup>
        {conflicts.map(({ event: other, who }) => (
          <StatusText key={other.id} $status="warning" role="status">
            {who.map((id) => names.get(id) ?? 'Someone').join(' and ')}{' '}
            {who.length === 1 ? 'already has' : 'already have'} “{other.title}”
            {other.startTime
              ? `, ${formatClock(other.startTime)}${other.endTime ? `–${formatClock(other.endTime)}` : ''}`
              : ' all day'}
            .
          </StatusText>
        ))}
        {Boolean(error) && <ErrorText role="alert">{apiErrorMessage(error)}</ErrorText>}
        <Row>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : event ? 'Save' : 'Add to calendar'}
          </Button>
          <Button type="button" $variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </Row>
      </Stack>
    </form>
  )
}
