import {
  CHORE_REPEAT_LABELS,
  CHORE_REPEATS,
  CHORE_TIME_OF_DAY_LABELS,
  CHORE_TIMES_OF_DAY,
  createChoreInputSchema,
  WEEKDAY_LABELS,
  type ChoreBoard,
  type ChoreRepeat,
  type ChoreTimeOfDay,
  type HouseholdMember,
} from '@households/shared'
import { useState, type FormEvent } from 'react'
import styled from 'styled-components'

import {
  Button,
  Card,
  CardList,
  CardTitle,
  Checkbox,
  ChipButton,
  ChipGroup,
  ConfirmButton,
  ErrorText,
  Grid,
  Muted,
  PointsBadge,
  Row,
  Select,
  Stack,
  TextArea,
  TextField,
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import { formatClock } from '../calendar/dates'
import type { ChoreActions } from './queries'

type BoardChore = ChoreBoard['chores'][number]

// "For" option meaning: people take turns (profile ids are uuids, so no clash).
const TURNS = 'turns'
const EVERY_DAY = WEEKDAY_LABELS.map((weekday) => weekday.day as number)

interface ChoreFields {
  title: string
  notes: string
  points: string
  /** A profile id, '' for anyone, or TURNS. */
  assignedTo: string
  repeat: ChoreRepeat
  dueOn: string
  needsApproval: boolean
  timeOfDay: ChoreTimeOfDay
  /** Daily chores: the days it's on. */
  weekdays: number[]
  /** With TURNS: who takes turns, in order. */
  rotation: string[]
  /** "16:00": remind them then if it isn't done; '' for no reminder. */
  remindAt: string
}

const EMPTY: ChoreFields = {
  title: '',
  notes: '',
  points: '10',
  assignedTo: '',
  repeat: 'daily',
  dueOn: '',
  needsApproval: true,
  timeOfDay: 'anytime',
  weekdays: EVERY_DAY,
  rotation: [],
  remindAt: '',
}

function fieldsOf(chore: BoardChore): ChoreFields {
  return {
    title: chore.title,
    notes: chore.notes ?? '',
    points: String(chore.points),
    assignedTo: chore.rotation ? TURNS : (chore.assignedTo ?? ''),
    repeat: chore.repeat,
    dueOn: chore.dueOn ?? '',
    needsApproval: chore.needsApproval,
    timeOfDay: chore.timeOfDay,
    weekdays: chore.weekdays ?? EVERY_DAY,
    rotation: chore.rotation ?? [],
    remindAt: chore.remindAt ?? '',
  }
}

function toInput(fields: ChoreFields) {
  const turns = fields.assignedTo === TURNS && fields.repeat !== 'once'
  return {
    title: fields.title,
    notes: fields.notes,
    points: Number(fields.points),
    assignedTo: fields.assignedTo && fields.assignedTo !== TURNS ? fields.assignedTo : null,
    repeat: fields.repeat,
    dueOn: fields.repeat === 'once' && fields.dueOn ? fields.dueOn : null,
    needsApproval: fields.needsApproval,
    timeOfDay: fields.timeOfDay,
    weekdays:
      fields.repeat === 'daily' && fields.weekdays.length < 7
        ? [...fields.weekdays].sort((a, b) => a - b)
        : null,
    rotation: turns ? fields.rotation : null,
    remindAt: fields.remindAt || null,
  }
}

/** Who, when and how, in one line for the chore list. */
function summary(chore: BoardChore, members: HouseholdMember[]): string {
  const name = (id: string) =>
    members.find((member) => member.profileId === id)?.displayName ?? 'Someone'
  const who = chore.rotation
    ? `Turns: ${chore.rotation.map(name).join(', then ')}`
    : chore.assignedTo
      ? name(chore.assignedTo)
      : 'Anyone'
  const when =
    chore.repeat === 'daily' && chore.weekdays
      ? WEEKDAY_LABELS.filter((weekday) => chore.weekdays?.includes(weekday.day))
          .map((weekday) => weekday.short)
          .join(', ')
      : CHORE_REPEAT_LABELS[chore.repeat]
  const time =
    chore.timeOfDay === 'anytime' ? '' : ` · ${CHORE_TIME_OF_DAY_LABELS[chore.timeOfDay]}`
  const reminder = chore.remindAt ? ` · reminder ${formatClock(chore.remindAt)}` : ''
  return `${who} · ${when}${time}${reminder}${chore.needsApproval ? ' · needs approval' : ''}`
}

/** For people who manage chores: add, edit, archive and delete them. */
export function ManageChoresCard({
  board,
  members,
  actions,
}: {
  board: ChoreBoard
  members: HouseholdMember[]
  actions: ChoreActions
}) {
  const [showArchived, setShowArchived] = useState(false)
  const shown = board.chores.filter((chore) => chore.archived === showArchived)

  return (
    <Card $variant="plain" $padding="lg">
      <Stack $gap={5}>
        <Row $justify="between">
          <CardTitle>Manage chores</CardTitle>
          <Button
            type="button"
            $variant="ghost"
            $size="sm"
            onClick={() => setShowArchived((value) => !value)}
          >
            {showArchived ? 'Show current' : 'Show archived'}
          </Button>
        </Row>
        {!showArchived && <NewChore members={members} actions={actions} />}
        {shown.length === 0 ? (
          <Muted>{showArchived ? 'Nothing archived.' : 'No chores yet.'}</Muted>
        ) : (
          <List>
            {shown.map((chore) => (
              <ChoreItem key={chore.id} chore={chore} members={members} actions={actions} />
            ))}
          </List>
        )}
      </Stack>
    </Card>
  )
}

function NewChore({ members, actions }: { members: HouseholdMember[]; actions: ChoreActions }) {
  const [fields, setFields] = useState<ChoreFields>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof ChoreFields, string>>>({})

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = createChoreInputSchema.safeParse(toInput(fields))
    if (!parsed.success) {
      const next: typeof errors = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof ChoreFields | undefined
        if (field && !next[field]) next[field] = issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    try {
      await actions.createChore.mutateAsync(parsed.data)
      setFields({
        ...EMPTY,
        remindAt: fields.remindAt,
        assignedTo: fields.assignedTo,
        rotation: fields.rotation,
        repeat: fields.repeat,
      })
    } catch {
      // Shown below.
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <Stack $gap={4}>
        <ChoreForm fields={fields} onChange={setFields} errors={errors} members={members} />
        {actions.createChore.isError && (
          <ErrorText role="alert">{apiErrorMessage(actions.createChore.error)}</ErrorText>
        )}
        <Row>
          <Button type="submit" disabled={actions.createChore.isPending}>
            {actions.createChore.isPending ? 'Adding…' : 'Add chore'}
          </Button>
        </Row>
      </Stack>
    </form>
  )
}

function ChoreForm({
  fields,
  onChange,
  errors,
  members,
}: {
  fields: ChoreFields
  onChange: (fields: ChoreFields) => void
  errors: Partial<Record<keyof ChoreFields, string>>
  members: HouseholdMember[]
}) {
  const set = <K extends keyof ChoreFields>(key: K, value: ChoreFields[K]) =>
    onChange({ ...fields, [key]: value })
  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
  const canTakeTurns = fields.repeat !== 'once' && members.length >= 2
  const turns = fields.assignedTo === TURNS && canTakeTurns

  return (
    <Stack $gap={4}>
      <Grid $columns={3} $gap={4}>
        <TextField
          label="Chore"
          placeholder="Feed the cat"
          value={fields.title}
          maxLength={80}
          onChange={(e) => set('title', e.target.value)}
          error={errors.title}
        />
        <Select
          label="For"
          placeholder="Anyone"
          value={turns ? TURNS : fields.assignedTo === TURNS ? '' : fields.assignedTo}
          onChange={(e) => set('assignedTo', e.target.value)}
        >
          {members.map((member) => (
            <option key={member.profileId} value={member.profileId}>
              {member.displayName}
            </option>
          ))}
          {canTakeTurns && <option value={TURNS}>Take turns</option>}
        </Select>
        <TextField
          label="Points"
          type="number"
          inputMode="numeric"
          min={0}
          max={1000}
          value={fields.points}
          onChange={(e) => set('points', e.target.value)}
          error={errors.points}
        />
        <Select
          label="How often"
          value={fields.repeat}
          onChange={(e) => set('repeat', e.target.value as ChoreRepeat)}
        >
          {CHORE_REPEATS.map((repeat) => (
            <option key={repeat} value={repeat}>
              {CHORE_REPEAT_LABELS[repeat]}
            </option>
          ))}
        </Select>
        <Select
          label="When in the day"
          value={fields.timeOfDay}
          onChange={(e) => set('timeOfDay', e.target.value as ChoreTimeOfDay)}
        >
          {CHORE_TIMES_OF_DAY.map((time) => (
            <option key={time} value={time}>
              {CHORE_TIME_OF_DAY_LABELS[time]}
            </option>
          ))}
        </Select>
        <TextField
          label="Remind at (optional)"
          type="time"
          hint="If it isn’t done by then (household time)."
          value={fields.remindAt}
          onChange={(e) => set('remindAt', e.target.value)}
          error={errors.remindAt}
        />
        {fields.repeat === 'once' && (
          <TextField
            label="Due (optional)"
            type="date"
            value={fields.dueOn}
            onChange={(e) => set('dueOn', e.target.value)}
            error={errors.dueOn}
          />
        )}
      </Grid>
      {fields.repeat === 'daily' && (
        <ChipGroup label="On these days" error={errors.weekdays}>
          {WEEKDAY_LABELS.map((weekday) => (
            <ChipButton
              key={weekday.day}
              pressed={fields.weekdays.includes(weekday.day)}
              aria-label={weekday.long}
              onClick={() => set('weekdays', toggle(fields.weekdays, weekday.day as number))}
            >
              {weekday.short}
            </ChipButton>
          ))}
        </ChipGroup>
      )}
      {turns && (
        <ChipGroup
          label="Who takes turns"
          hint={`Tap people in the order they go. It moves to the next person each ${
            fields.repeat === 'daily' ? 'day' : fields.repeat === 'weekly' ? 'week' : 'month'
          }.`}
          error={errors.rotation}
        >
          {members.map((member) => {
            const place = fields.rotation.indexOf(member.profileId)
            return (
              <ChipButton
                key={member.profileId}
                pressed={place >= 0}
                onClick={() => set('rotation', toggle(fields.rotation, member.profileId))}
              >
                {place >= 0 ? `${place + 1}. ` : ''}
                {member.displayName}
              </ChipButton>
            )
          })}
        </ChipGroup>
      )}
      <TextArea
        label="Notes (optional)"
        rows={2}
        value={fields.notes}
        maxLength={500}
        onChange={(e) => set('notes', e.target.value)}
        error={errors.notes}
      />
      <Checkbox
        checked={fields.needsApproval}
        onChange={(e) => set('needsApproval', e.target.checked)}
      >
        Someone who manages chores approves it before the points count
      </Checkbox>
      {fields.needsApproval && (
        <Muted>
          Nobody approves their own chores: yours wait for someone else who manages chores.
        </Muted>
      )}
    </Stack>
  )
}

function ChoreItem({
  chore,
  members,
  actions,
}: {
  chore: BoardChore
  members: HouseholdMember[]
  actions: ChoreActions
}) {
  const [editing, setEditing] = useState(false)
  const [nudged, setNudged] = useState(false)
  const [fields, setFields] = useState<ChoreFields>(() => fieldsOf(chore))
  const canNudge = !chore.archived && Boolean(chore.assignedTo ?? chore.rotation)
  const [errors, setErrors] = useState<Partial<Record<keyof ChoreFields, string>>>({})

  async function onSave(event: FormEvent) {
    event.preventDefault()
    const parsed = createChoreInputSchema.safeParse(toInput(fields))
    if (!parsed.success) {
      const next: typeof errors = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof ChoreFields | undefined
        if (field && !next[field]) next[field] = issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    try {
      await actions.updateChore.mutateAsync({ choreId: chore.id, ...parsed.data })
      setEditing(false)
    } catch {
      // Shown below.
    }
  }

  if (editing) {
    return (
      <li>
        <form onSubmit={(e) => void onSave(e)} noValidate>
          <Stack $gap={4}>
            <ChoreForm fields={fields} onChange={setFields} errors={errors} members={members} />
            {actions.updateChore.isError && (
              <ErrorText role="alert">{apiErrorMessage(actions.updateChore.error)}</ErrorText>
            )}
            <Row>
              <Button type="submit" $size="sm" disabled={actions.updateChore.isPending}>
                Save
              </Button>
              <Button type="button" $variant="ghost" $size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </Row>
          </Stack>
        </form>
      </li>
    )
  }

  return (
    <li>
      <Line>
        <Stack $gap={1}>
          <Title>{chore.title}</Title>
          <Row $gap={2}>
            <Muted as="span">{summary(chore, members)}</Muted>
            {chore.points > 0 && <PointsBadge>+{chore.points}</PointsBadge>}
          </Row>
        </Stack>
        <Row $gap={1}>
          {canNudge && (
            <Button
              type="button"
              $variant="ghost"
              $size="sm"
              disabled={actions.nudge.isPending || nudged}
              onClick={() =>
                actions.nudge.mutate(chore.id, {
                  onSuccess: () => setNudged(true),
                })
              }
            >
              {nudged ? 'Reminded' : 'Remind'}
            </Button>
          )}
          {!chore.archived && (
            <Button type="button" $variant="ghost" $size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          <Button
            type="button"
            $variant="ghost"
            $size="sm"
            onClick={() =>
              actions.updateChore.mutate({ choreId: chore.id, archived: !chore.archived })
            }
          >
            {chore.archived ? 'Restore' : 'Archive'}
          </Button>
          <ConfirmButton
            message={`Delete “${chore.title}”? Points already earned stay.`}
            confirmLabel="Yes, delete it"
            busy={actions.deleteChore.isPending}
            onConfirm={() => actions.deleteChore.mutate(chore.id)}
          >
            Delete
          </ConfirmButton>
        </Row>
      </Line>
      {actions.nudge.isError && actions.nudge.variables === chore.id && (
        <ErrorText role="alert">{apiErrorMessage(actions.nudge.error)}</ErrorText>
      )}
    </li>
  )
}

const List = styled(CardList)`
  > li:first-child {
    border-top: 0;
    padding-top: 0;
  }
`

const Line = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]}px;
`

const Title = styled.p`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`
