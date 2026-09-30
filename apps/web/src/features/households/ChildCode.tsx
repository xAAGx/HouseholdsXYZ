import { CHILD_CODE_TTL_MINUTES, formatChildCode } from '@households/shared'

import { CodeDisplay, Muted, Stack, Text } from '../../components/ui'
import { formatTime } from '../../lib/format'

/** A child's one-time sign-in code, with what to do with it. */
export function ChildCode({
  childName,
  code,
  expiresAt,
}: {
  childName: string
  code: string
  expiresAt: string
}) {
  return (
    <Stack $gap={3}>
      <CodeDisplay code={formatChildCode(code)} />
      <Text>
        On {childName}’s device, go to Sign in, choose <strong>Child sign in</strong> and enter this
        code. They stay signed in on that device.
      </Text>
      <Muted>
        Works once, for {CHILD_CODE_TTL_MINUTES} minutes (until {formatTime(expiresAt)}).
      </Muted>
    </Stack>
  )
}
