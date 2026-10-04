import styled from 'styled-components'

import { Icon } from '../../components/icons'
import { ButtonLink, CountBadge } from '../../components/ui'
import { useNotifications } from './queries'

/** The bell in the header: opens notifications, with the unread count. */
export function NotificationsButton() {
  const inbox = useNotifications()
  const unread = inbox.data?.unread ?? 0
  return (
    <Bell
      to="/notifications"
      $variant="ghost"
      $size="sm"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <Icon name="bell" size={20} />
      {unread > 0 && (
        <CountBadge $floating aria-hidden="true">
          {unread > 99 ? '99+' : unread}
        </CountBadge>
      )}
    </Bell>
  )
}

// An icon button: square-ish, so the count can sit on its corner.
const Bell = styled(ButtonLink)`
  position: relative;
  flex-shrink: 0;
  padding: 0 10px;
`
