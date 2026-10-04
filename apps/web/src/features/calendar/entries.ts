import type { CalendarEntry, CalendarEvent, HouseholdMember } from '@households/shared'
import type { Accent } from '@households/theme'

import type { IconName } from '../../components/icons'

// How calendar entries are told apart: events take the colour of the person
// they're for (Cozi-style); list items, chores and meals have their icons.

/** One colour per person, in the order they joined (accents are details: dots only). */
const PERSON_TONES: Accent[] = ['sky', 'coral', 'grass', 'grape', 'yellow']

export function memberTones(members: HouseholdMember[]): Map<string, Accent> {
  const ordered = [...members].sort(
    (a, b) =>
      (a.joinedAt ?? '').localeCompare(b.joinedAt ?? '') || a.profileId.localeCompare(b.profileId),
  )
  return new Map(
    ordered.map((member, i) => [member.profileId, PERSON_TONES[i % PERSON_TONES.length]!]),
  )
}

export const KIND_ICONS: Record<Exclude<CalendarEntry['kind'], 'event'>, IconName> = {
  due: 'lists',
  chore: 'chores',
  meal: 'meals',
}

export function entryLabel(entry: CalendarEntry, events: Map<string, CalendarEvent>): string {
  switch (entry.kind) {
    case 'event':
      return events.get(entry.eventId)?.title ?? 'Event'
    case 'due':
      return entry.text
    case 'chore':
      return entry.title
    case 'meal':
      return entry.title
  }
}

/** Who an entry is for: an event's people, or whoever a list item or chore is assigned to. */
export function entryPeople(entry: CalendarEntry, events: Map<string, CalendarEvent>): string[] {
  switch (entry.kind) {
    case 'event':
      return events.get(entry.eventId)?.people ?? []
    case 'due':
    case 'chore':
      return entry.assignedTo ? [entry.assignedTo] : []
    case 'meal':
      return []
  }
}

/** Just one person's things, or everything. */
export function forPerson(
  entries: CalendarEntry[],
  events: Map<string, CalendarEvent>,
  person: string | null,
): CalendarEntry[] {
  if (!person) return entries
  return entries.filter((entry) => entryPeople(entry, events).includes(person))
}

const KIND_ORDER: Record<CalendarEntry['kind'], number> = { event: 0, due: 1, chore: 2, meal: 3 }

/** All-day events first, then by start time; then due items, chores and meals. */
export function sortEntries(entries: CalendarEntry[], events: Map<string, CalendarEvent>) {
  const time = (entry: CalendarEntry) =>
    entry.kind === 'event' ? (events.get(entry.eventId)?.startTime ?? '') : ''
  return [...entries].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || time(a).localeCompare(time(b)),
  )
}

/** Entries by day, multi-day events on every day they cover, within `days`. */
export function entriesByDay(entries: CalendarEntry[], days: string[]) {
  const map = new Map<string, CalendarEntry[]>()
  for (const entry of entries) {
    const end = entry.kind === 'event' ? entry.endDate : entry.date
    for (const day of days) {
      if (day >= entry.date && day <= end) map.set(day, [...(map.get(day) ?? []), entry])
    }
  }
  return map
}
