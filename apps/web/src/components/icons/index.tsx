/**
 * Line icons: 24px grid, 2px stroke, round caps and joins, currentColor.
 * Add new icons in the same style; no emoji and no filled icon sets.
 */

export type IconName =
  | 'chores'
  | 'calendar'
  | 'lists'
  | 'money'
  | 'vault'
  | 'memories'
  | 'chat'
  | 'home'
  | 'check'
  | 'bell'
  | 'meals'
  | 'chevronLeft'
  | 'chevronRight'

const paths: Record<IconName, string> = {
  chores: 'M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  calendar:
    'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 3v4M16 3v4',
  lists: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  money: 'M3 7a2 2 0 0 1 2-2h14v4M3 7v10a2 2 0 0 0 2 2h14V9H5a2 2 0 0 1-2-2zM16 14h.01',
  vault: 'M6 11V8a6 6 0 1 1 12 0v3M5 11h14v10H5zM12 15v2',
  memories: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15.5 9.5h.01',
  chat: 'M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z',
  home: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  bell: 'M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16zM10 21h4',
  meals:
    'M3 12h18a9 9 0 0 1-18 0zM8 8c0-1.5 1.5-2 1.5-3.5S8 3 8 3M14 8c0-1.5 1.5-2 1.5-3.5S14 3 14 3',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
}

export function Icon({
  name,
  size = 24,
  strokeWidth = 2,
  label,
}: {
  name: IconName
  size?: number
  strokeWidth?: number
  /** Accessible name. Omit for decorative icons next to visible text. */
  label?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={paths[name]} />
    </svg>
  )
}
