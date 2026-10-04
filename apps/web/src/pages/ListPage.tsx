import {
  guessStoreSection,
  LIST_KIND_LABELS,
  LIST_KINDS,
  LIST_VISIBILITIES,
  LIST_VISIBILITY_HINTS,
  LIST_VISIBILITY_LABELS,
  localDate,
  MAX_BULK_ITEMS,
  OTHER_SECTION,
  splitItemLines,
  STORE_SECTIONS,
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
  Eyebrow,
  Grid,
  Muted,
  Page,
  PageTitle,
  Pill,
  ProgressBar,
  Row,
  Select,
  Stack,
  StatusText,
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
  useAddItems,
  useClearDone,
  useDeleteItem,
  useDeleteList,
  useDuplicateList,
  useList,
  useReorderItems,
  useResetList,
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
            <ListBody view={view} basePath={basePath} list={list.data} />
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

interface ItemContext {
  householdId: string
  list: ListDetail
  names: Map<string, string>
  me: string
  assignable: HouseholdMember[]
  today: string
}

/** Shopping items grouped by store section, in shop order; unsorted ones last. */
function bySection(items: ListItem[]): { section: string; items: ListItem[] }[] {
  const order: string[] = [...STORE_SECTIONS, OTHER_SECTION]
  const groups = new Map<string, ListItem[]>()
  for (const item of items) {
    const section = item.category && order.includes(item.category) ? item.category : OTHER_SECTION
    groups.set(section, [...(groups.get(section) ?? []), item])
  }
  return order
    .filter((section) => groups.has(section))
    .map((section) => ({ section, items: groups.get(section) ?? [] }))
}

function ListBody({
  view,
  basePath,
  list,
}: {
  view: MemberView
  basePath: string
  list: ListDetail
}) {
  const householdId = view.household.id
  const open = list.items.filter((item) => item.doneAt === null)
  const done = list.items.filter((item) => item.doneAt !== null)
  const [showDone, setShowDone] = useState(false)
  const reorder = useReorderItems(householdId, list.id)
  const clearDone = useClearDone(householdId, list.id)
  const shopping = list.kind === 'shopping'
  const ctx: ItemContext = {
    householdId,
    list,
    names: memberNames(view),
    me: view.members.find((member) => member.isMe)?.profileId ?? '',
    assignable: eligibleMembers(view, list),
    today: localDate(),
  }

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
      <Stack $gap={3}>
        <PageTitle>{list.title}</PageTitle>
        <Row $gap={3}>
          <Pill>{LIST_VISIBILITY_LABELS[list.visibility]}</Pill>
          <Muted as="span">
            {LIST_KIND_LABELS[list.kind]} ·{' '}
            {list.itemCount === 0 ? 'Empty' : `${list.doneCount} of ${list.itemCount} done`}
          </Muted>
        </Row>
        {list.itemCount > 0 && (
          <ProgressBar
            value={list.doneCount}
            max={list.itemCount}
            label={`${list.doneCount} of ${list.itemCount} done`}
          />
        )}
      </Stack>

      {list.archived && (
        <Card $variant="soft" $tone="yellow" $padding="md">
          <Text>
            This list is archived, so it can’t be changed. Restore it below to use it again.
          </Text>
        </Card>
      )}

      {list.canEditItems && <AddItems ctx={ctx} />}

      <Card $padding="lg">
        <Stack $gap={3}>
          <CardTitle>To do</CardTitle>
          {open.length === 0 && (
            <Muted>{list.itemCount === 0 ? 'Nothing here yet.' : 'All done.'}</Muted>
          )}
          {open.length > 0 && shopping && (
            <Stack $gap={4}>
              {bySection(open).map(({ section, items }) => (
                <Stack key={section} $gap={2}>
                  <Eyebrow as="h4">{section}</Eyebrow>
                  <Items>
                    {items.map((item) => (
                      <ItemRow key={item.id} ctx={ctx} item={item} />
                    ))}
                  </Items>
                </Stack>
              ))}
            </Stack>
          )}
          {open.length > 0 && !shopping && (
            <Items>
              {open.map((item, index) => (
                <ItemRow
                  key={item.id}
                  ctx={ctx}
                  item={item}
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
                    <ItemRow key={item.id} ctx={ctx} item={item} />
                  ))}
                </Items>
                {list.canEditItems && (
                  <div>
                    <ConfirmButton
                      message={`Remove the ${done.length} done ${done.length === 1 ? 'item' : 'items'} from this list for good?`}
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

/** Add one item (with details), or several at once, one per line. */
function AddItems({ ctx }: { ctx: ItemContext }) {
  const { list } = ctx
  const [several, setSeveral] = useState(false)
  const [text, setText] = useState('')
  const [lines, setLines] = useState('')
  const [quantity, setQuantity] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string>()
  const add = useAddItem(ctx.householdId, list.id)
  const addMany = useAddItems(ctx.householdId, list.id)
  const pending = splitItemLines(lines)
  const section = list.kind === 'shopping' && text.trim() ? guessStoreSection(text) : null

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(undefined)
    try {
      if (several) {
        if (pending.length === 0) return setError('Write at least one item.')
        if (pending.length > MAX_BULK_ITEMS)
          return setError(`Add up to ${MAX_BULK_ITEMS} at a time.`)
        await addMany.mutateAsync(pending)
        setLines('')
        return
      }
      if (!text.trim()) return setError('Write something.')
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
      // Shown below from the mutation's error.
    }
  }

  const failed = add.error ?? addMany.error
  const busy = add.isPending || addMany.isPending

  return (
    <Card $padding="lg">
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <Stack $gap={4}>
          {several ? (
            <TextArea
              label="Items, one per line"
              rows={5}
              placeholder={list.kind === 'shopping' ? 'Milk\nBread\nApples' : 'One thing per line'}
              value={lines}
              onChange={(e) => setLines(e.target.value)}
              hint={
                list.kind === 'shopping'
                  ? 'Each one goes under its store section. You can change it later.'
                  : 'Paste a list from anywhere. Bullets and numbers are dropped.'
              }
              error={error}
            />
          ) : (
            <AddRow>
              <TextField
                label="Add an item"
                placeholder={list.kind === 'shopping' ? 'Milk' : 'What needs doing?'}
                value={text}
                maxLength={200}
                onChange={(e) => setText(e.target.value)}
                hint={section ? `Goes under ${section}` : undefined}
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
          )}
          {!several && more && (
            <Grid $columns={2} $gap={4}>
              <Select
                label="For"
                placeholder="Anyone"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
              >
                {ctx.assignable.map((member) => (
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
          {failed && <ErrorText role="alert">{apiErrorMessage(failed)}</ErrorText>}
          <Row>
            <Button type="submit" disabled={busy}>
              {busy
                ? 'Adding…'
                : several
                  ? pending.length > 1
                    ? `Add ${pending.length} items`
                    : 'Add'
                  : 'Add'}
            </Button>
            {!several && (
              <Button
                type="button"
                $variant="ghost"
                aria-expanded={more}
                onClick={() => setMore((value) => !value)}
              >
                {more ? 'Fewer options' : 'Who and when'}
              </Button>
            )}
            <Button
              type="button"
              $variant="ghost"
              onClick={() => {
                setSeveral((value) => !value)
                setError(undefined)
              }}
            >
              {several ? 'Add one at a time' : 'Add several'}
            </Button>
          </Row>
        </Stack>
      </form>
    </Card>
  )
}

function DueStatus({ dueOn, today }: { dueOn: string; today: string }) {
  if (dueOn < today) return <StatusText $status="danger">Overdue · {formatDay(dueOn)}</StatusText>
  if (dueOn === today) return <StatusText $status="warning">Due today</StatusText>
  return null
}

function ItemRow({
  ctx,
  item,
  onMoveUp,
  onMoveDown,
}: {
  ctx: ItemContext
  item: ListItem
  onMoveUp?: (() => void) | undefined
  onMoveDown?: (() => void) | undefined
}) {
  const { list, names, me, today } = ctx
  const [editing, setEditing] = useState(false)
  const update = useUpdateItem(ctx.householdId, list.id)
  const isDone = item.doneAt !== null
  const urgent = !isDone && item.dueOn !== null && item.dueOn <= today

  const meta = [
    item.quantity,
    item.assignedTo &&
      `For ${item.assignedTo === me ? 'you' : (names.get(item.assignedTo) ?? 'someone')}`,
    item.dueOn && !urgent && `Due ${formatDay(item.dueOn)}`,
    isDone && item.doneBy && `Done by ${names.get(item.doneBy) ?? 'someone'}`,
    !isDone &&
      list.visibility !== 'private' &&
      item.createdBy &&
      item.createdBy !== me &&
      `Added by ${names.get(item.createdBy) ?? 'someone'}`,
  ].filter(Boolean)

  if (editing) {
    return (
      <li>
        <EditItem
          ctx={ctx}
          item={item}
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
          {(meta.length > 0 || urgent) && (
            <MetaLine>
              {urgent && item.dueOn && <DueStatus dueOn={item.dueOn} today={today} />}
              {urgent && meta.length > 0 && ' · '}
              {meta.join(' · ')}
            </MetaLine>
          )}
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
  ctx,
  item,
  onMoveUp,
  onMoveDown,
  onDone,
}: {
  ctx: ItemContext
  item: ListItem
  onMoveUp?: (() => void) | undefined
  onMoveDown?: (() => void) | undefined
  onDone: () => void
}) {
  const { list } = ctx
  const [text, setText] = useState(item.text)
  const [quantity, setQuantity] = useState(item.quantity ?? '')
  const [note, setNote] = useState(item.note ?? '')
  const [category, setCategory] = useState(item.category ?? '')
  const [assignedTo, setAssignedTo] = useState(item.assignedTo ?? '')
  const [dueOn, setDueOn] = useState(item.dueOn ?? '')
  const update = useUpdateItem(ctx.householdId, list.id)
  const remove = useDeleteItem(ctx.householdId, list.id)

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
        ...(list.kind === 'shopping' && { category: category || null }),
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
          {list.kind === 'shopping' && (
            <Select
              label="Store section"
              placeholder={OTHER_SECTION}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {STORE_SECTIONS.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </Select>
          )}
          <Select
            label="For"
            placeholder="Anyone"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
          >
            {ctx.assignable.map((member) => (
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
  const reset = useResetList(householdId, list.id)
  const duplicate = useDuplicateList(householdId, list.id)
  const [title, setTitle] = useState(list.title)
  const [kind, setKind] = useState<ListKind>(list.kind)
  const [visibility, setVisibility] = useState<ListVisibility>(list.visibility)
  const [memberIds, setMemberIds] = useState<string[]>(list.memberIds)
  const [copyTitle, setCopyTitle] = useState<string | null>(null)
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

  async function makeCopy() {
    if (!copyTitle?.trim()) return
    try {
      const { list: copy } = await duplicate.mutateAsync(copyTitle)
      setCopyTitle(null)
      await navigate(`${basePath}/lists/${copy.id}`)
    } catch {
      // Shown below from duplicate.error.
    }
  }

  const failed = error ?? update.error ?? reset.error ?? duplicate.error ?? remove.error

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
          {!list.archived && (
            <Row>
              <Button type="submit" $size="sm" disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </Row>
          )}

          <Divider />

          <Stack $gap={3}>
            <Muted>Use it again</Muted>
            <Row>
              {!list.archived && list.doneCount > 0 && (
                <ConfirmButton
                  message={`Untick all ${list.doneCount} done items, to go through the list again?`}
                  confirmLabel="Yes, untick them"
                  busy={reset.isPending}
                  onConfirm={() => reset.mutate(undefined)}
                >
                  Untick everything
                </ConfirmButton>
              )}
              {copyTitle === null && (
                <Button
                  type="button"
                  $variant="secondary"
                  $size="sm"
                  onClick={() => setCopyTitle(`${list.title} (copy)`)}
                >
                  Make a copy
                </Button>
              )}
            </Row>
            {copyTitle !== null && (
              <Stack $gap={3}>
                <TextField
                  label="Name of the copy"
                  value={copyTitle}
                  maxLength={80}
                  onChange={(e) => setCopyTitle(e.target.value)}
                  hint="Same items, all unticked, shared with the same people."
                />
                <Row>
                  <Button
                    type="button"
                    $variant="secondary"
                    $size="sm"
                    disabled={duplicate.isPending}
                    onClick={() => void makeCopy()}
                  >
                    {duplicate.isPending ? 'Copying…' : 'Create copy'}
                  </Button>
                  <Button
                    type="button"
                    $variant="ghost"
                    $size="sm"
                    onClick={() => setCopyTitle(null)}
                  >
                    Cancel
                  </Button>
                </Row>
              </Stack>
            )}
          </Stack>

          <Divider />

          <Row>
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
          {failed && (
            <ErrorText role="alert">
              {typeof failed === 'string' ? failed : apiErrorMessage(failed)}
            </ErrorText>
          )}
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

const Divider = styled.hr`
  margin: 0;
  border: 0;
  border-top: ${({ theme }) => theme.borderWidths.hairline}px solid
    ${({ theme }) => theme.colors.hairline};
`
