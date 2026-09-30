import {
  LIST_KIND_LABELS,
  LIST_KINDS,
  LIST_VISIBILITIES,
  LIST_VISIBILITY_HINTS,
  LIST_VISIBILITY_LABELS,
  type HouseholdMember,
  type ListDetail,
  type ListItem,
  type ListKind,
  type ListVisibility,
} from '@households/shared'
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import styled from 'styled-components'

import {
  Button,
  ButtonLink,
  Card,
  CardList,
  CardTitle,
  Checkbox,
  ConfirmButton,
  ErrorText,
  Grid,
  Muted,
  Page,
  PageTitle,
  Pill,
  Row,
  Select,
  Stack,
  Text,
  TextArea,
  TextField,
} from '../components/ui'
import { visuallyHidden } from '../components/ui/mixins'
import { HouseholdSubHeader, MemberGate } from '../features/households/MemberGate'
import { memberNames, type MemberView } from '../features/households/member-view'
import { MemberPicker } from '../features/lists/MemberPicker'
import {
  useAddItem,
  useClearDone,
  useDeleteItem,
  useDeleteList,
  useList,
  useReorderItems,
  useUpdateItem,
  useUpdateList,
} from '../features/lists/queries'
import { apiErrorMessage } from '../lib/api-errors'
import { formatDay } from '../lib/format'
import { NotFoundPage } from './NotFoundPage'

/** /…/lists/:listId */
export function ListPage() {
  const { listId = '' } = useParams()
  return (
    <MemberGate subPath={`/lists/${listId}`}>
      {(view, basePath) => <ListScreen view={view} basePath={basePath} listId={listId} />}
    </MemberGate>
  )
}

function ListScreen({
  view,
  basePath,
  listId,
}: {
  view: MemberView
  basePath: string
  listId: string
}) {
  const list = useList(view.household.id, listId)
  const names = memberNames(view)

  if (list.isError) return <NotFoundPage />

  return (
    <>
      <HouseholdSubHeader view={view} basePath={basePath} />
      <Page $medium>
        <Stack $gap={5}>
          <div>
            <ButtonLink to={`${basePath}/lists`} $variant="ghost" $size="sm">
              All lists
            </ButtonLink>
          </div>
          {list.isPending ? (
            <Muted>Loading…</Muted>
          ) : (
            <ListBody view={view} basePath={basePath} list={list.data} names={names} />
          )}
        </Stack>
      </Page>
    </>
  )
}

/** Who an item can be for: the people who can see the list. */
function eligibleMembers(view: MemberView, list: ListDetail): HouseholdMember[] {
  return view.members.filter(
    (member) =>
      list.visibility === 'household' ||
      member.profileId === list.createdBy ||
      list.memberIds.includes(member.profileId),
  )
}

function ListBody({
  view,
  basePath,
  list,
  names,
}: {
  view: MemberView
  basePath: string
  list: ListDetail
  names: Map<string, string>
}) {
  const householdId = view.household.id
  const open = list.items.filter((item) => item.doneAt === null)
  const done = list.items.filter((item) => item.doneAt !== null)
  const [showDone, setShowDone] = useState(false)
  const reorder = useReorderItems(householdId, list.id)
  const clearDone = useClearDone(householdId, list.id)
  const assignable = eligibleMembers(view, list)

  function move(itemId: string, by: -1 | 1) {
    const ids = open.map((item) => item.id)
    const from = ids.indexOf(itemId)
    const to = from + by
    if (from < 0 || to < 0 || to >= ids.length) return
    ;[ids[from], ids[to]] = [ids[to] as string, ids[from] as string]
    reorder.mutate([...ids, ...done.map((item) => item.id)])
  }

  return (
    <Stack $gap={5}>
      <Stack $gap={2}>
        <PageTitle>{list.title}</PageTitle>
        <Row $gap={3}>
          <Pill>{LIST_VISIBILITY_LABELS[list.visibility]}</Pill>
          <Muted as="span">
            {LIST_KIND_LABELS[list.kind]} ·{' '}
            {list.itemCount === 0 ? 'Empty' : `${list.doneCount} of ${list.itemCount} done`}
          </Muted>
        </Row>
      </Stack>

      {list.archived && (
        <Card $variant="soft" $tone="yellow" $padding="md">
          <Text>
            This list is archived, so it can’t be changed. Restore it below to use it again.
          </Text>
        </Card>
      )}

      {list.canEditItems && (
        <AddItem householdId={householdId} list={list} assignable={assignable} />
      )}

      <Card $padding="lg">
        <Stack $gap={3}>
          <CardTitle>To do</CardTitle>
          {open.length === 0 ? (
            <Muted>{list.itemCount === 0 ? 'Nothing here yet.' : 'All done.'}</Muted>
          ) : (
            <Items>
              {open.map((item, index) => (
                <ItemRow
                  key={item.id}
                  householdId={householdId}
                  list={list}
                  item={item}
                  names={names}
                  assignable={assignable}
                  onMoveUp={index > 0 ? () => move(item.id, -1) : undefined}
                  onMoveDown={index < open.length - 1 ? () => move(item.id, 1) : undefined}
                />
              ))}
            </Items>
          )}
          {reorder.isError && <ErrorText role="alert">{apiErrorMessage(reorder.error)}</ErrorText>}
        </Stack>
      </Card>

      {done.length > 0 && (
        <Card $variant="plain" $padding="lg">
          <Stack $gap={3}>
            <Row $justify="between">
              <CardTitle>Done ({done.length})</CardTitle>
              <Button
                type="button"
                $variant="ghost"
                $size="sm"
                aria-expanded={showDone}
                onClick={() => setShowDone((value) => !value)}
              >
                {showDone ? 'Hide' : 'Show'}
              </Button>
            </Row>
            {showDone && (
              <>
                <Items>
                  {done.map((item) => (
                    <ItemRow
                      key={item.id}
                      householdId={householdId}
                      list={list}
                      item={item}
                      names={names}
                      assignable={assignable}
                    />
                  ))}
                </Items>
                {list.canEditItems && (
                  <div>
                    <ConfirmButton
                      message={`Remove the ${done.length} done ${done.length === 1 ? 'item' : 'items'} from this list?`}
                      confirmLabel="Yes, clear them"
                      busy={clearDone.isPending}
                      onConfirm={() => clearDone.mutate(undefined)}
                    >
                      Clear done items
                    </ConfirmButton>
                  </div>
                )}
              </>
            )}
          </Stack>
        </Card>
      )}

      {list.canManage && <ListSettings view={view} basePath={basePath} list={list} />}
    </Stack>
  )
}

function AddItem({
  householdId,
  list,
  assignable,
}: {
  householdId: string
  list: ListDetail
  assignable: HouseholdMember[]
}) {
  const [text, setText] = useState('')
  const [quantity, setQuantity] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [more, setMore] = useState(false)
  const add = useAddItem(householdId, list.id)
  const [error, setError] = useState<string>()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!text.trim()) {
      setError('Write something.')
      return
    }
    setError(undefined)
    try {
      await add.mutateAsync({
        text,
        quantity: quantity || null,
        assignedTo: assignedTo || null,
        dueOn: dueOn || null,
      })
      setText('')
      setQuantity('')
      setDueOn('')
    } catch {
      // Shown below from add.error.
    }
  }

  return (
    <Card $padding="lg">
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <Stack $gap={4}>
          <AddRow>
            <TextField
              label="Add an item"
              placeholder={list.kind === 'shopping' ? 'Milk' : 'What needs doing?'}
              value={text}
              maxLength={200}
              onChange={(e) => setText(e.target.value)}
              error={error}
            />
            {list.kind === 'shopping' && (
              <TextField
                label="How much"
                placeholder="2 litres"
                value={quantity}
                maxLength={40}
                onChange={(e) => setQuantity(e.target.value)}
              />
            )}
          </AddRow>
          {more && (
            <Grid $columns={2} $gap={4}>
              <Select
                label="For"
                placeholder="Anyone"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
              >
                {assignable.map((member) => (
                  <option key={member.profileId} value={member.profileId}>
                    {member.displayName}
                  </option>
                ))}
              </Select>
              <TextField
                label="Due"
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
              />
            </Grid>
          )}
          {add.isError && <ErrorText role="alert">{apiErrorMessage(add.error)}</ErrorText>}
          <Row>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? 'Adding…' : 'Add'}
            </Button>
            <Button
              type="button"
              $variant="ghost"
              aria-expanded={more}
              onClick={() => setMore((value) => !value)}
            >
              {more ? 'Fewer options' : 'Who and when'}
            </Button>
          </Row>
        </Stack>
      </form>
    </Card>
  )
}

function ItemRow({
  householdId,
  list,
  item,
  names,
  assignable,
  onMoveUp,
  onMoveDown,
}: {
  householdId: string
  list: ListDetail
  item: ListItem
  names: Map<string, string>
  assignable: HouseholdMember[]
  onMoveUp?: (() => void) | undefined
  onMoveDown?: (() => void) | undefined
}) {
  const [editing, setEditing] = useState(false)
  const update = useUpdateItem(householdId, list.id)
  const isDone = item.doneAt !== null

  const meta = [
    item.quantity,
    item.assignedTo && `For ${names.get(item.assignedTo) ?? 'someone'}`,
    item.dueOn && `Due ${formatDay(item.dueOn)}`,
    isDone && item.doneBy && `Done by ${names.get(item.doneBy) ?? 'someone'}`,
  ].filter(Boolean)

  if (editing) {
    return (
      <li>
        <EditItem
          householdId={householdId}
          list={list}
          item={item}
          assignable={assignable}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onDone={() => setEditing(false)}
        />
      </li>
    )
  }

  return (
    <li>
      <ItemLine>
        <Stack $gap={1}>
          <Checkbox
            large
            checked={isDone}
            disabled={!list.canEditItems}
            onChange={(e) => update.mutate({ itemId: item.id, done: e.target.checked })}
          >
            {isDone ? <Crossed>{item.text}</Crossed> : item.text}
          </Checkbox>
          {meta.length > 0 && <MetaLine>{meta.join(' · ')}</MetaLine>}
          {item.note && <MetaLine>{item.note}</MetaLine>}
        </Stack>
        {list.canEditItems && (
          <Button type="button" $variant="ghost" $size="sm" onClick={() => setEditing(true)}>
            Edit<Hidden> {item.text}</Hidden>
          </Button>
        )}
      </ItemLine>
      {update.isError && <ErrorText role="alert">{apiErrorMessage(update.error)}</ErrorText>}
    </li>
  )
}

function EditItem({
  householdId,
  list,
  item,
  assignable,
  onMoveUp,
  onMoveDown,
  onDone,
}: {
  householdId: string
  list: ListDetail
  item: ListItem
  assignable: HouseholdMember[]
  onMoveUp?: (() => void) | undefined
  onMoveDown?: (() => void) | undefined
  onDone: () => void
}) {
  const [text, setText] = useState(item.text)
  const [quantity, setQuantity] = useState(item.quantity ?? '')
  const [note, setNote] = useState(item.note ?? '')
  const [assignedTo, setAssignedTo] = useState(item.assignedTo ?? '')
  const [dueOn, setDueOn] = useState(item.dueOn ?? '')
  const update = useUpdateItem(householdId, list.id)
  const remove = useDeleteItem(householdId, list.id)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      await update.mutateAsync({
        itemId: item.id,
        text,
        quantity: quantity || null,
        note: note || null,
        assignedTo: assignedTo || null,
        dueOn: dueOn || null,
      })
      onDone()
    } catch {
      // Shown below from update.error.
    }
  }

  return (
    <EditBox onSubmit={(e) => void onSubmit(e)} noValidate>
      <Stack $gap={4}>
        <Grid $columns={2} $gap={4}>
          <TextField
            label="Item"
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
          />
          <TextField
            label="How much"
            value={quantity}
            maxLength={40}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <Select
            label="For"
            placeholder="Anyone"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
          >
            {assignable.map((member) => (
              <option key={member.profileId} value={member.profileId}>
                {member.displayName}
              </option>
            ))}
          </Select>
          <TextField
            label="Due"
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
          />
        </Grid>
        <TextArea
          label="Note"
          rows={2}
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
        {(update.isError || remove.isError) && (
          <ErrorText role="alert">{apiErrorMessage(update.error ?? remove.error)}</ErrorText>
        )}
        <Row $justify="between">
          <Row>
            <Button type="submit" $size="sm" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" $variant="ghost" $size="sm" onClick={onDone}>
              Cancel
            </Button>
          </Row>
          <Row $gap={1}>
            {onMoveUp && (
              <Button type="button" $variant="ghost" $size="sm" onClick={onMoveUp}>
                Move up
              </Button>
            )}
            {onMoveDown && (
              <Button type="button" $variant="ghost" $size="sm" onClick={onMoveDown}>
                Move down
              </Button>
            )}
            <Button
              type="button"
              $variant="ghost"
              $size="sm"
              disabled={remove.isPending}
              onClick={() => remove.mutate(item.id)}
            >
              Remove
            </Button>
          </Row>
        </Row>
      </Stack>
    </EditBox>
  )
}

function ListSettings({
  view,
  basePath,
  list,
}: {
  view: MemberView
  basePath: string
  list: ListDetail
}) {
  const navigate = useNavigate()
  const householdId = view.household.id
  const update = useUpdateList(householdId, list.id)
  const remove = useDeleteList(householdId, list.id)
  const [title, setTitle] = useState(list.title)
  const [kind, setKind] = useState<ListKind>(list.kind)
  const [visibility, setVisibility] = useState<ListVisibility>(list.visibility)
  const [memberIds, setMemberIds] = useState<string[]>(list.memberIds)
  const [error, setError] = useState<string>()

  function save(event: FormEvent) {
    event.preventDefault()
    if (visibility === 'selected_members' && memberIds.length === 0) {
      setError('Choose at least one person.')
      return
    }
    setError(undefined)
    update.mutate({
      title,
      kind,
      ...(list.canChangeAudience && {
        visibility,
        ...(visibility === 'selected_members' && { memberIds }),
      }),
    })
  }

  return (
    <Card $variant="plain" $padding="lg">
      <form onSubmit={save} noValidate>
        <Stack $gap={4}>
          <CardTitle>List settings</CardTitle>
          <Grid $columns={2} $gap={4}>
            <TextField
              label="Name"
              value={title}
              maxLength={80}
              disabled={list.archived}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Select
              label="Kind"
              value={kind}
              disabled={list.archived}
              onChange={(e) => setKind(e.target.value as ListKind)}
            >
              {LIST_KINDS.map((k) => (
                <option key={k} value={k}>
                  {LIST_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Grid>
          {list.canChangeAudience ? (
            <>
              <Select
                label="Who can see it"
                value={visibility}
                disabled={list.archived}
                onChange={(e) => setVisibility(e.target.value as ListVisibility)}
                hint={LIST_VISIBILITY_HINTS[visibility]}
              >
                {LIST_VISIBILITIES.map((v) => (
                  <option key={v} value={v}>
                    {LIST_VISIBILITY_LABELS[v]}
                  </option>
                ))}
              </Select>
              {visibility === 'selected_members' && (
                <MemberPicker members={view.members} selected={memberIds} onChange={setMemberIds} />
              )}
            </>
          ) : (
            <Muted>Only the person who made this list can change who sees it.</Muted>
          )}
          {(error || update.isError) && (
            <ErrorText role="alert">{error ?? apiErrorMessage(update.error)}</ErrorText>
          )}
          <Row>
            {!list.archived && (
              <Button type="submit" $size="sm" disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            )}
            <Button
              type="button"
              $variant="secondary"
              $size="sm"
              disabled={update.isPending}
              onClick={() => update.mutate({ archived: !list.archived })}
            >
              {list.archived ? 'Restore list' : 'Archive list'}
            </Button>
            <ConfirmButton
              message={`Delete “${list.title}” and all ${list.itemCount} items for everyone? This can’t be undone.`}
              confirmLabel="Yes, delete the list"
              busy={remove.isPending}
              onConfirm={() =>
                remove.mutate(undefined, {
                  onSuccess: () => void navigate(`${basePath}/lists`, { replace: true }),
                })
              }
            >
              Delete list
            </ConfirmButton>
          </Row>
          {remove.isError && <ErrorText role="alert">{apiErrorMessage(remove.error)}</ErrorText>}
        </Stack>
      </form>
    </Card>
  )
}

const Items = styled(CardList)`
  > li:first-child {
    border-top: 0;
    padding-top: 0;
  }

  > li:last-child {
    padding-bottom: 0;
  }
`

const ItemLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[2]}px;
`

const MetaLine = styled.p`
  padding-left: 34px;
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  color: ${({ theme }) => theme.colors.textMuted};
`

const Crossed = styled.span`
  text-decoration: line-through;
  color: ${({ theme }) => theme.colors.textMuted};
`

const Hidden = styled.span`
  ${visuallyHidden};
`

const AddRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: ${({ theme }) => theme.space[4]}px;

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`

const EditBox = styled.form`
  padding: ${({ theme }) => theme.space[4]}px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.surfaceMuted};
`
