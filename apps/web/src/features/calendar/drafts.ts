import { deviceTimeZone, type EventInput, type QuickEvent } from '@households/shared'

/** A quick-add event as the API takes it: household-wide, in this device's time zone. */
export function quickEventInput(event: QuickEvent): EventInput {
  return {
    title: event.title,
    startsOn: event.startsOn,
    endsOn: event.endsOn,
    startTime: event.startTime,
    endTime: event.endTime,
    timeZone: deviceTimeZone(),
    repeat: event.repeat,
    people: event.people,
    visibility: 'household',
    sharedWith: [],
  }
}
