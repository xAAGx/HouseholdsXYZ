import 'styled-components'

import type { AppTheme } from '@households/theme'

// Types `props.theme` in every styled component.
declare module 'styled-components' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- module augmentation
  export interface DefaultTheme extends AppTheme {}
}
