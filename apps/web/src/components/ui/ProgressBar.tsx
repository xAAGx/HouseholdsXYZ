import styled from 'styled-components'

/**
 * How far along something is: a list, or the points towards a reward.
 * A real <progress>-like element for screen readers, drawn with tokens.
 * `kind="limit"` is for spending against a budget: reaching the end isn't an
 * achievement, so it turns the warning color instead of green.
 */
export function ProgressBar({
  value,
  max,
  label,
  kind = 'goal',
}: {
  value: number
  max: number
  /** Read out by screen readers, e.g. "3 of 7 done". */
  label: string
  kind?: 'goal' | 'limit'
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const full = ratio >= 1
  return (
    <Track
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
    >
      <Fill
        style={{ width: `${Math.round(ratio * 100)}%` }}
        $state={!full ? 'going' : kind === 'limit' ? 'over' : 'done'}
      />
    </Track>
  )
}

const Track = styled.div`
  width: 100%;
  height: 10px;
  overflow: hidden;
  border: 1.5px solid ${({ theme }) => theme.colors.outline};
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background: ${({ theme }) => theme.colors.surface};
`

const Fill = styled.div<{ $state: 'going' | 'done' | 'over' }>`
  height: 100%;
  background: ${({ theme, $state }) =>
    $state === 'done'
      ? theme.colors.accents.grass.base
      : $state === 'over'
        ? theme.colors.accents.coral.base
        : theme.colors.primary};
  transition: width ${({ theme }) => theme.durations.base}ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`
