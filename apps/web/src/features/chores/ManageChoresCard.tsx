import {
  CHORE_REPEAT_LABELS,
  CHORE_REPEATS,
  createChoreInputSchema,
  type ChoreBoard,
  type ChoreRepeat,
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
import type { ChoreActions } from './queries'

type BoardChore = ChoreBoard['chores'][number]

interface ChoreFields {
  title: string
  notes: string
  points: string
  assignedTo: string
  repeat: ChoreRepeat
  dueOn: string
  needsApproval: boolean
}

const EMPTY: ChoreFields = {
  title: '',
  notes: '',
  points: '10',
  assignedTo: '',
  repeat: 'daily',
  dueOn: '',
  needsApproval: true,
}

function fieldsOf(chore: BoardChore): ChoreFields {
  return {
    title: chore.title,
    notes: chore.notes ?? '',
    points: String(chore.points),
    assignedTo: chore.assignedTo ?? '',
    repeat: chore.repeat,
    dueOn: chore.dueOn ?? '',
    needsApproval: chore.needsApproval,
  }
}

function toInput(fields: ChoreFields) {
  return {
    title: fields.title,
    notes: fields.notes,
    points: Number(fields.points),
    assignedTo: fields.assignedTo || null,
    repeat: fields.repeat,
    dueOn: fields.repeat === 'once' && fields.dueOn ? fields.dueOn : null,
    needsApproval: fields.needsApproval,
  }
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
      setFields({ ...EMPTY, assignedTo: fields.assignedTo, repeat: fields.repeat })
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
          value={fields.assignedTo}
          onChange={(e) => set('assignedTo', e.target.value)}
        >
          {members.map((member) => (
            <option key={member.profileId} value={member.profileId}>
              {member.displayName}
            </option>
          ))}
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
  const [fields, setFields] = useState<ChoreFields>(() => fieldsOf(chore))
  const [errors, setErrors] = useState<Partial<Record<keyof ChoreFields, string>>>({})
  const who = members.find((member) => member.profileId === chore.assignedTo)?.displayName

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
            <Muted as="span">
              {who ?? 'Anyone'} · {CHORE_REPEAT_LABELS[chore.repeat]}
              {chore.needsApproval ? ' · needs approval' : ''}
            </Muted>
            {chore.points > 0 && <PointsBadge>+{chore.points}</PointsBadge>}
          </Row>
        </Stack>
        <Row $gap={1}>
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
