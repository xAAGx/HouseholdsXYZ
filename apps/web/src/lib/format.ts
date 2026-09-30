const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

/** "12 Oct" in the reader's own format. */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso))
}

/** "4:05 PM" in the reader's own format. */
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso))
}
