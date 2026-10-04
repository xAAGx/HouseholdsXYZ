import { startGroupInputSchema, type ChatInbox, type HouseholdMember } from '@households/shared'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import styled from 'styled-components'

import {
  Button,
  Card,
  CardTitle,
  ChipButton,
  ChipGroup,
  CountBadge,
  ErrorText,
  Muted,
  Row,
  Stack,
  TextField,
} from '../../components/ui'
import { focusRing } from '../../components/ui/mixins'
import { apiErrorMessage } from '../../lib/api-errors'
import { formatRelative } from '../../lib/format'
import { conversationName, lastMessageText } from './names'
import type { ChatActions } from './queries'

/** Every conversation you're in, newest first, and starting a new one. */
export function ConversationList({
  inbox,
  members,
  me,
  selectedId,
  chatPath,
  actions,
}: {
  inbox: ChatInbox
  members: HouseholdMember[]
  me: string
  selectedId: string | null
  /** The household's chat page, e.g. "/us/…/TheSmiths/chat". */
  chatPath: string
  actions: ChatActions
}) {
  const [starting, setStarting] = useState(false)

  return (
    <Card $variant="plain" $padding="sm">
      <Stack $gap={3}>
        <Row $justify="between">
          <CardTitle as="h2">Chats</CardTitle>
          {inbox.canPost && !starting && members.length > 1 && (
            <Button type="button" $variant="secondary" $size="sm" onClick={() => setStarting(true)}>
              New chat
            </Button>
          )}
        </Row>
        {starting && (
          <NewChat
            members={members}
            chatPath={chatPath}
            actions={actions}
            onDone={() => setStarting(false)}
          />
        )}
        <List>
          {inbox.conversations.map((conversation) => {
            const selected = conversation.id === selectedId
            return (
              <li key={conversation.id}>
                <Item
                  to={`${chatPath}/${conversation.id}`}
                  aria-current={selected ? 'page' : undefined}
                  $selected={selected}
                >
                  <Stack $gap={1}>
                    <Line>
                      <Name>{conversationName(conversation, members, me)}</Name>
                      {conversation.lastMessage && (
                        <Muted as="span">
                          {formatRelative(conversation.lastMessage.createdAt)}
                        </Muted>
                      )}
                    </Line>
                    <Line>
                      <Preview>{lastMessageText(conversation, members, me)}</Preview>
                      {conversation.unread > 0 && (
                        <CountBadge aria-label={`${conversation.unread} unread`}>
                          {conversation.unread > 99 ? '99+' : conversation.unread}
                        </CountBadge>
                      )}
                      {conversation.muted && conversation.unread === 0 && (
                        <Muted as="span">Muted</Muted>
                      )}
                    </Line>
                  </Stack>
                </Item>
              </li>
            )
          })}
        </List>
      </Stack>
    </Card>
  )
}

/**
 * One person: a direct chat (reopened if there is one). More than one: a
 * named group.
 */
function NewChat({
  members,
  chatPath,
  actions,
  onDone,
}: {
  members: HouseholdMember[]
  chatPath: string
  actions: ChatActions
  onDone: () => void
}) {
  const navigate = useNavigate()
  const [chosen, setChosen] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const others = members.filter((member) => !member.isMe)
  const group = chosen.length > 1
  const busy = actions.direct.isPending || actions.startGroup.isPending
  const error = actions.direct.error ?? actions.startGroup.error

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (chosen.length === 0) {
      setProblem('Choose who to talk to.')
      return
    }
    try {
      let id: string
      if (group) {
        const parsed = startGroupInputSchema.safeParse({ title, memberIds: chosen })
        if (!parsed.success) {
          setProblem(parsed.error.issues[0]?.message ?? 'Give the group a name.')
          return
        }
        setProblem(null)
        id = (await actions.startGroup.mutateAsync(parsed.data)).id
      } else {
        setProblem(null)
        id = (await actions.direct.mutateAsync(chosen[0]!)).id
      }
      onDone()
      void navigate(`${chatPath}/${id}`)
    } catch {
      // Shown below.
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <Stack $gap={3}>
        <ChipGroup label="With" hint="Choose one person, or several for a group.">
          {others.map((member) => (
            <ChipButton
              key={member.profileId}
              pressed={chosen.includes(member.profileId)}
              onClick={() =>
                setChosen((current) =>
                  current.includes(member.profileId)
                    ? current.filter((id) => id !== member.profileId)
                    : [...current, member.profileId],
                )
              }
            >
              {member.displayName}
            </ChipButton>
          ))}
        </ChipGroup>
        {group && (
          <TextField
            label="Group name"
            placeholder="Holiday plans"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
          />
        )}
        {problem && <ErrorText role="alert">{problem}</ErrorText>}
        {Boolean(error) && <ErrorText role="alert">{apiErrorMessage(error)}</ErrorText>}
        <Row>
          <Button type="submit" $size="sm" disabled={busy}>
            {group ? 'Start group' : 'Open chat'}
          </Button>
          <Button type="button" $variant="ghost" $size="sm" onClick={onDone}>
            Cancel
          </Button>
        </Row>
      </Stack>
    </form>
  )
}

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]}px;
`

const Item = styled(Link)<{ $selected: boolean }>`
  display: block;
  padding: ${({ theme }) => theme.space[3]}px;
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme, $selected }) => ($selected ? theme.colors.surfaceMuted : 'transparent')};
  color: inherit;
  text-decoration: none;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceMuted};
  }

  &:focus-visible {
    ${focusRing};
  }
`

// One line each: long names and messages shorten instead of wrapping.
const Line = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[2]}px;
  min-width: 0;

  > span:last-child:not(:first-child) {
    flex-shrink: 0;
  }
`

const Name = styled.span`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`

const Preview = styled.span`
  min-width: 0;
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  color: ${({ theme }) => theme.colors.textMuted};
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`
