import {
  createListInputSchema,
  LIST_KIND_LABELS,
  LIST_KINDS,
  LIST_VISIBILITIES,
  LIST_VISIBILITY_HINTS,
  LIST_VISIBILITY_LABELS,
  localDate,
  type ListKind,
  type ListSummary,
  type ListVisibility,
} from '@households/shared'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import styled from 'styled-components'

import { Icon } from '../components/icons'
import {
  Button,
  Card,
  CardList,
  CardTitle,
  Checkbox,
  ErrorText,
  Grid,
  IconChip,
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
  TextField,
} from '../components/ui'
import { HouseholdSubHeader, MemberGate } from '../features/households/MemberGate'
import type { MemberView } from '../features/households/member-view'
import { LIST_KIND_LOOK } from '../features/lists/kinds'
import { MemberPicker } from '../features/lists/MemberPicker'
import {
  useAssignedItems,
  useCreateList,
  useLists,
  useToggleAnyItem,
} from '../features/lists/queries'
import { apiErrorMessage } from '../lib/api-errors'
import { formatDay } from '../lib/format'

/** /…/lists: every list the signed-in member can see in this household. */
export function ListsPage() {
  return (
    <MemberGate subPath="/lists">
      {(view, basePath) => <Lists view={view} basePath={basePath} />}
    </MemberGate>
  )
}

function Lists({ view, basePath }: { view: MemberView; basePath: string }) {
  const [archived, setArchived] = useState(false)
  const lists = useLists(view.household.id, archived)
  const canCreate = view.permissions.includes('create_posts')

  return (
    <>
      <HouseholdSubHeader view={view} basePath={basePath} />
      <Page>
        <Stack $gap={6}>
          <Header>
            <Stack $gap={1}>
              <PageTitle>{archived ? 'Archived lists' : 'Lists'}</PageTitle>
              <Muted>{view.household.name}</Muted>
            </Stack>
            <Button
              type="button"
              $variant="ghost"
              $size="sm"
              onClick={() => setArchived((value) => !value)}
            >
              {archived ? 'Show current lists' : 'Show archived lists'}
            </Button>
          </Header>

          {!archived && <ForYou view={view} basePath={basePath} />}
          {!archived && canCreate && <NewList view={view} basePath={basePath} />}

          {lists.isPending && <Muted>Loading…</Muted>}
          {lists.isError && <Text>We couldn’t load the lists. Please try again in a moment.</Text>}
          {lists.data?.length === 0 && (
            <Text>
              {archived
                ? 'Nothing archived.'
                : 'No lists yet. Start one for groceries, weekend jobs or a trip.'}
            </Text>
          )}
          {lists.data && lists.data.length > 0 && (
            <Grid $columns={3} $gap={4}>
              {lists.data.map((list) => (
                <ListCard key={list.id} list={list} to={`${basePath}/lists/${list.id}`} />
              ))}
            </Grid>
          )}
        </Stack>
      </Page>
    </>
  )
}

function ListCard({ list, to }: { list: ListSummary; to: string }) {
  const look = LIST_KIND_LOOK[list.kind]
  const progress = list.itemCount === 0 ? 'Empty' : `${list.doneCount} of ${list.itemCount} done`
  return (
    <CardLink to={to}>
      <Card $padding="md">
        <Stack $gap={3}>
          <Row $gap={3}>
            <IconChip $tone={look.tone} $size={36} aria-hidden="true">
              <Icon name={look.icon} size={18} />
            </IconChip>
            <CardTitle>{list.title}</CardTitle>
          </Row>
          {list.itemCount > 0 && (
            <ProgressBar value={list.doneCount} max={list.itemCount} label={progress} />
          )}
          <Row $justify="between">
            <Muted as="span">{progress}</Muted>
            <Pill>{LIST_VISIBILITY_LABELS[list.visibility]}</Pill>
          </Row>
        </Stack>
      </Card>
    </CardLink>
  )
}

/** Items someone asked you to do, across all your lists, soonest first. */
function ForYou({ view, basePath }: { view: MemberView; basePath: string }) {
  const items = useAssignedItems(view.household.id)
  const toggle = useToggleAnyItem(view.household.id)
  const today = localDate()
  if (!items.data || items.data.length === 0) return null

  return (
    <Card $variant="soft" $tone="sky" $padding="lg">
      <Stack $gap={3}>
        <CardTitle>For you</CardTitle>
        <Assigned>
          {items.data.map(({ listId, listTitle, item }) => (
            <li key={item.id}>
              <Stack $gap={1}>
                <Checkbox
                  large
                  checked={false}
                  disabled={toggle.isPending}
                  onChange={() => toggle.mutate({ listId, itemId: item.id, done: true })}
                >
                  {item.text}
                </Checkbox>
                <Meta>
                  <Link to={`${basePath}/lists/${listId}`}>{listTitle}</Link>
                  {item.dueOn && item.dueOn < today && (
                    <StatusText $status="danger"> · Overdue</StatusText>
                  )}
                  {item.dueOn === today && <StatusText $status="warning"> · Due today</StatusText>}
                  {item.dueOn && item.dueOn > today && ` · Due ${formatDay(item.dueOn)}`}
                </Meta>
              </Stack>
            </li>
          ))}
        </Assigned>
        {toggle.isError && <ErrorText role="alert">{apiErrorMessage(toggle.error)}</ErrorText>}
      </Stack>
    </Card>
  )
}

function NewList({ view, basePath }: { view: MemberView; basePath: string }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<ListKind>('todo')
  const [visibility, setVisibility] = useState<ListVisibility>('household')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [errors, setErrors] = useState<{ title?: string; memberIds?: string }>({})
  const create = useCreateList(view.household.id)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = createListInputSchema.safeParse({ title, kind, visibility, memberIds })
    if (!parsed.success) {
      const next: typeof errors = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if ((field === 'title' || field === 'memberIds') && !next[field])
          next[field] = issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    try {
      const { list } = await create.mutateAsync(parsed.data)
      await navigate(`${basePath}/lists/${list.id}`)
    } catch {
      // Shown below from create.error.
    }
  }

  return (
    <Card $padding="lg">
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <Stack $gap={4}>
          <CardTitle>Start a list</CardTitle>
          <Grid $columns={3} $gap={4}>
            <TextField
              label="Name"
              placeholder="Groceries"
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
              error={errors.title}
            />
            <Select label="Kind" value={kind} onChange={(e) => setKind(e.target.value as ListKind)}>
              {LIST_KINDS.map((k) => (
                <option key={k} value={k}>
                  {LIST_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
            <Select
              label="Who can see it"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as ListVisibility)}
              hint={LIST_VISIBILITY_HINTS[visibility]}
            >
              {LIST_VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {LIST_VISIBILITY_LABELS[v]}
                </option>
              ))}
            </Select>
          </Grid>
          {visibility === 'selected_members' && (
            <MemberPicker
              members={view.members}
              selected={memberIds}
              onChange={setMemberIds}
              error={errors.memberIds}
            />
          )}
          {create.isError && <ErrorText role="alert">{apiErrorMessage(create.error)}</ErrorText>}
          <Row>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create list'}
            </Button>
          </Row>
        </Stack>
      </form>
    </Card>
  )
}

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]}px;
`

const Assigned = styled(CardList)`
  > li:first-child {
    border-top: 0;
    padding-top: 0;
  }
`

const Meta = styled.p`
  padding-left: 34px;
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  color: ${({ theme }) => theme.colors.textMuted};
`

const CardLink = styled(Link)`
  display: block;
  color: inherit;
  text-decoration: none;
  border-radius: ${({ theme }) => theme.radii.lg}px;

  &:hover h3 {
    text-decoration: underline;
  }
`
