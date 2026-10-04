import { eventIcs, type CalendarEvent } from '@households/shared'

/**
 * Saves one event as an .ics file, made on this device, for the person's own
 * calendar app (Apple, Google, Outlook). Nothing is sent anywhere.
 */
export function downloadEventIcs(event: CalendarEvent) {
  const blob = new Blob([eventIcs(event)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${event.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'event'}.ics`
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
