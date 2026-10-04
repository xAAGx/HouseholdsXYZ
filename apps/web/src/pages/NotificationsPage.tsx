import type { AppNotification } from '@households/shared'
import { Link } from 'react-router'
import styled from 'styled-components'

import { AppHeader } from '../components/app/AppHeader'
import {
  Button,
  ButtonLink,
  Card,
  CardList,
  ErrorText,
  Muted,
  Page,
  PageTitle,
  Stack,
  StatusDot,
  Text,
} from '../components/ui'
import { visuallyHidden } from '../components/ui/mixins'
import { useMyHouseholds } from '../features/households/queries'
import { useMarkNotificationsRead, useNotifications } from '../features/notifications/queries'
import { apiErrorMessage } from '../lib/api-errors'
import { formatRelative } from '../lib/format'

/** /notifications: what needs you, newest first. */
export function NotificationsPage() {
  const inbox = useNotifications()
  const households = useMyHouseholds()
  const markRead = useMarkNotificationsRead()
  const names = new Map((households.data ?? []).map((h) => [h.id, h.name]))
  const showHousehold = names.size > 1
  const unread = inbox.data?.unread ?? 0

  return (
    <>
      <AppHeader
        actions={
          <ButtonLink to="/app" $variant="ghost" $size="sm">
            Your households
          </ButtonLink>
        }
      />
      <Page $medium>
        <Stack $gap={6}>
          <Header>
            <Stack $gap={1}>
              <PageTitle>Notifications</PageTitle>
              <Muted>
                {unread > 0 ? `${unread} unread` : 'All caught up'} ·{' '}
                <Link to="/account#notifications">Notification settings</Link>
              </Muted>
            </Stack>
            {unread > 0 && (
              <Button
                type="button"
                $variant="secondary"
                $size="sm"
                disabled={markRead.isPending}
                onClick={() => markRead.mutate(undefined)}
              >
                Mark all read
              </Button>
            )}
          </Header>

          {inbox.isPending && <Muted>Loading…</Muted>}
          {inbox.isError && (
            <Text>We couldn’t load your notifications. Please try again in a moment.</Text>
          )}
          {inbox.data && inbox.data.notifications.length === 0 && (
            <Card $padding="lg">
              <Text>
                Nothing yet. Chores to approve, things put down for you and reward requests will
                show up here.
              </Text>
            </Card>
          )}
          {inbox.data && inbox.data.notifications.length > 0 && (
            <Card $padding="lg">
              <List>
                {inbox.data.notifications.map((notification) => (
                  <Item
                    key={notification.id}
                    notification={notification}
                    household={showHousehold ? names.get(notification.householdId) : undefined}
                    onOpen={() => {
                      if (!notification.readAt) markRead.mutate([notification.id])
                    }}
                  />
                ))}
              </List>
            </Card>
          )}
          {markRead.isError && (
            <ErrorText role="alert">{apiErrorMessage(markRead.error)}</ErrorText>
          )}
        </Stack>
      </Page>
    </>
  )
}

function Item({
  notification,
  household,
  onOpen,
}: {
  notification: AppNotification
  household: string | undefined
  onOpen: () => void
}) {
  const unread = notification.readAt === null
  return (
    <li>
      <ItemLink to={notification.path} onClick={onOpen}>
        <ItemRow>
          <Dot aria-hidden="true">{unread && <StatusDot $tone="coral" />}</Dot>
          <Stack $gap={1}>
            <Title $unread={unread}>
              {unread && <Hidden>Unread: </Hidden>}
              {notification.title}
            </Title>
            {notification.body && <Muted>{notification.body}</Muted>}
            <Muted>
              {formatRelative(notification.createdAt)}
              {household && ` · ${household}`}
            </Muted>
          </Stack>
        </ItemRow>
      </ItemLink>
    </li>
  )
}

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]}px;
`

const List = styled(CardList)`
  > li:first-child {
    border-top: 0;
    padding-top: 0;
  }
`

const ItemLink = styled(Link)`
  display: block;
  color: inherit;
  text-decoration: none;
  border-radius: ${({ theme }) => theme.radii.md}px;

  &:hover p:first-child {
    text-decoration: underline;
  }
`

const ItemRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[3]}px;
`

const Dot = styled.span`
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 8px;
  height: 24px;
`

const Title = styled.p<{ $unread: boolean }>`
  font-weight: ${({ theme, $unread }) =>
    $unread ? theme.fontWeights.bold : theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`

const Hidden = styled.span`
  ${visuallyHidden};
`
