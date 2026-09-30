import type { ListKind } from '@households/shared'
import type { Accent } from '@households/theme'

import type { IconName } from '../../components/icons'

/** Each kind of list gets its own icon and tint on the lists page. */
export const LIST_KIND_LOOK: Record<ListKind, { icon: IconName; tone: Accent }> = {
  todo: { icon: 'check', tone: 'grass' },
  shopping: { icon: 'lists', tone: 'sky' },
  packing: { icon: 'home', tone: 'yellow' },
  other: { icon: 'lists', tone: 'grape' },
}
