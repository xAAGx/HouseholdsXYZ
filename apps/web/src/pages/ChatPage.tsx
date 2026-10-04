import { useParams } from 'react-router'
import styled, { useTheme } from 'styled-components'

import { ButtonLink, Muted, Page, PageTitle, Stack, Text } from '../components/ui'
import { useAuth } from '../features/auth/auth-context'
import { ConversationList } from '../features/chat/ConversationList'
import { useChatActions, useChatInbox } from '../features/chat/queries'
import { Thread } from '../features/chat/Thread'
import { HouseholdSubHeader, MemberGate } from '../features/households/MemberGate'
import type { MemberView } from '../features/households/member-view'
import { apiErrorMessage } from '../lib/api-errors'
import { useMediaQuery } from '../lib/use-media-query'

/**
 * /…/chat and /…/chat/:conversationId: the household's conversations. Wide
 * screens show the list beside the open conversation (the household chat
 * until you pick another); phones show one or the other.
 */
export function ChatPage() {
  const { conversationId } = useParams()
  return (
    <MemberGate subPath={conversationId ? `/chat/${conversationId}` : '/chat'}>
      {(view, basePath) => (
        <Chat view={view} basePath={basePath} conversationId={conversationId ?? null} />
      )}
    </MemberGate>
  )
}

function Chat({
  view,
  basePath,
  conversationId,
}: {
  view: MemberView
  basePath: string
  conversationId: string | null
}) {
  const theme = useTheme()
  const wide = useMediaQuery(`(min-width: ${theme.breakpoints.lg + 1}px)`)
  const { session } = useAuth()
  const me = session?.user.id ?? ''
  const householdId = view.household.id
  const inbox = useChatInbox(householdId)
  const actions = useChatActions(householdId)
  const chatPath = `${basePath}/chat`
  const householdChat = inbox.data?.conversations.find((c) => c.kind === 'household')?.id ?? null
  const selected = conversationId ?? (wide ? householdChat : null)

  const list = inbox.data && (
    <ConversationList
      inbox={inbox.data}
      members={view.members}
      me={me}
      selectedId={selected}
      chatPath={chatPath}
      actions={actions}
    />
  )
  const thread = selected && (
    <Thread
      householdId={householdId}
      conversationId={selected}
      chatPath={chatPath}
      members={view.members}
      me={me}
      actions={actions}
    />
  )

  return (
    <>
      <HouseholdSubHeader view={view} basePath={basePath} />
      <Page>
        <Stack $gap={5}>
          <Stack $gap={1}>
            <PageTitle>Chat</PageTitle>
            <Muted>Only people in {view.household.name} can read these.</Muted>
          </Stack>
          {inbox.isPending && <Muted>Loading…</Muted>}
          {inbox.isError && <Text>We couldn’t load the chats. {apiErrorMessage(inbox.error)}</Text>}
          {inbox.data &&
            (wide ? (
              <Columns>
                {list}
                {thread}
              </Columns>
            ) : conversationId ? (
              <Stack $gap={3}>
                <div>
                  <ButtonLink to={chatPath} $variant="ghost" $size="sm">
                    All chats
                  </ButtonLink>
                </div>
                {thread}
              </Stack>
            ) : (
              list
            ))}
        </Stack>
      </Page>
    </>
  )
}

const Columns = styled.div`
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(0, 2fr);
  align-items: start;
  gap: ${({ theme }) => theme.space[5]}px;
`
