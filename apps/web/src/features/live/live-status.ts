// Whether live updates are connected. While they are, pages hear about
// changes as they happen and only poll now and then as a safety net; without
// them, pages poll often.

let connected = false
const listeners = new Set<() => void>()

export function setLiveConnected(value: boolean) {
  if (value === connected) return
  connected = value
  for (const listener of listeners) listener()
}

export function subscribeLiveStatus(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const isLiveConnected = () => connected

/** For TanStack Query's refetchInterval: slow when live, `fastMs` otherwise. */
export const liveInterval = (fastMs: number) => () => (connected ? 120_000 : fastMs)
