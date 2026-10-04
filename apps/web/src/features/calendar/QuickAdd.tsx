import {
  EVENT_REPEAT_LABELS,
  parseQuickEvent,
  type HouseholdMember,
  type QuickEvent,
} from '@households/shared'
import { useState, type FormEvent } from 'react'
import styled from 'styled-components'

import { Button, ErrorText, Muted, Row, Stack, TextField } from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import { formatDay } from '../../lib/format'
import { formatClock } from './dates'
import { quickEventInput } from './drafts'
import type { CalendarActions } from './queries'

function describe(event: QuickEvent, names: Map<string, string>): string {
  const when = [
    event.endsOn
      ? `${formatDay(event.startsOn)} – ${formatDay(event.endsOn)}`
      : formatDay(event.startsOn),
    event.startTime
      ? event.endTime
        ? `${formatClock(event.startTime)}–${formatClock(event.endTime)}`
        : formatClock(event.startTime)
      : 'all day',
    event.repeat !== 'none' ? EVENT_REPEAT_LABELS[event.repeat].toLowerCase() : null,
    event.people.length > 0
      ? `for ${event.people.map((id) => names.get(id) ?? 'someone').join(', ')}`
      : null,
  ]
  return when.filter(Boolean).join(' · ')
}

/**
 * Add to the calendar in plain words ("Leo swim Tuesday 5pm every week"),
 * as Cozi and Fantastical do. Shows what it understood before adding; "More
 * options" opens the full form with it filled in.
 */
export function QuickAdd({
  today,
  members,
  actions,
  onMore,
}: {
  today: string
  members: HouseholdMember[]
  actions: CalendarActions
  onMore: (draft: QuickEvent | null) => void
}) {
  const [text, setText] = useState('')
  const [added, setAdded] = useState<string | null>(null)
  const people = members.map((member) => ({ id: member.profileId, name: member.displayName }))
  const names = new Map(members.map((member) => [member.profileId, member.displayName]))
  const parsed = text.trim() ? parseQuickEvent(text, today, people) : null

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!parsed) return
    try {
      await actions.create.mutateAsync(quickEventInput(parsed))
      setAdded(`Added “${parsed.title}”, ${describe(parsed, names)}.`)
      setText('')
    } catch {
      // Shown below.
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <Stack $gap={3}>
        <TextField
          label="Add to the calendar"
          placeholder="Leo swim Tuesday 5pm every week"
          value={text}
          maxLength={200}
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value)
            setAdded(null)
          }}
          hint={
            parsed ? (
              <Understood>
                <strong>{parsed.title}</strong> · {describe(parsed, names)}
              </Understood>
            ) : (
              'Write it as you’d say it: who, what, when.'
            )
          }
        />
        {added && (
          <Muted role="status" aria-live="polite">
            {added}
          </Muted>
        )}
        {actions.create.isError && (
          <ErrorText role="alert">{apiErrorMessage(actions.create.error)}</ErrorText>
        )}
        <Row>
          <Button type="submit" disabled={!parsed || actions.create.isPending}>
            {actions.create.isPending ? 'Adding…' : 'Add'}
          </Button>
          <Button type="button" $variant="ghost" onClick={() => onMore(parsed)}>
            More options
          </Button>
        </Row>
      </Stack>
    </form>
  )
}

const Understood = styled.span`
  color: ${({ theme }) => theme.colors.text};

  strong {
    font-weight: ${({ theme }) => theme.fontWeights.bold};
  }
`
