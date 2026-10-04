import { ApiError } from '@households/shared'
import { useEffect, useState } from 'react'

import {
  Button,
  Card,
  CardTitle,
  Checkbox,
  ErrorText,
  Muted,
  Row,
  Stack,
  StatusText,
  Text,
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import {
  currentSubscription,
  forgetThisDevice,
  PushBlockedError,
  pushPermission,
  pushSupport,
  subscribeThisDevice,
  subscriptionJson,
} from './push'
import { usePushConfig, usePushDevice, useSavePushDevice, useUpdatePushDevice } from './queries'

/**
 * Account settings: push notifications on this device. Off until turned on,
 * and the lock screen shows only "Something new" unless details are allowed.
 */
export function PushSettingsCard() {
  const config = usePushConfig()
  const support = pushSupport()
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const device = usePushDevice(endpoint)
  const save = useSavePushDevice()
  const update = useUpdatePushDevice()
  const [showDetails, setShowDetails] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    void currentSubscription()
      .then((subscription) => setEndpoint(subscription?.endpoint ?? null))
      .catch(() => setEndpoint(null))
      .finally(() => setChecked(true))
  }, [])

  const on = endpoint !== null && device.data?.subscribed === true
  const thisEndpoint = endpoint ?? ''

  async function turnOn() {
    if (!config.data?.publicKey) return
    setBusy(true)
    setProblem(null)
    try {
      const subscription = await subscribeThisDevice(config.data.publicKey)
      const json = subscriptionJson(subscription)
      if (!json) {
        await subscription.unsubscribe()
        throw new Error('unsupported')
      }
      await save.mutateAsync({ subscription: json, showDetails })
      setEndpoint(subscription.endpoint)
    } catch (error) {
      setProblem(
        error instanceof PushBlockedError
          ? 'Notifications are blocked for this site. Allow them in your browser’s site settings, then try again.'
          : error instanceof ApiError
            ? apiErrorMessage(error)
            : 'We couldn’t turn notifications on in this browser.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function turnOff() {
    setBusy(true)
    setProblem(null)
    try {
      await forgetThisDevice()
      setEndpoint(null)
    } catch {
      setProblem('We couldn’t turn notifications off. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  let content
  if (config.isPending || !checked) {
    content = <Muted>Loading…</Muted>
  } else if (!config.data?.available) {
    content = <Text>Notifications aren’t switched on for this app yet.</Text>
  } else if (support === 'needs-install') {
    content = (
      <Text>
        On iPhone and iPad, add Households to your Home Screen first (Share, then Add to Home
        Screen), open it from there, and turn notifications on here.
      </Text>
    )
  } else if (support === 'unsupported') {
    content = <Text>This browser can’t show notifications.</Text>
  } else if (on) {
    content = (
      <Stack $gap={4} $align="start">
        <StatusText $status="success">On for this device</StatusText>
        <Checkbox
          checked={device.data?.showDetails ?? false}
          disabled={update.isPending}
          onChange={(e) => update.mutate({ endpoint: thisEndpoint, showDetails: e.target.checked })}
        >
          Show what it’s about on the lock screen
        </Checkbox>
        <Button
          type="button"
          $variant="ghost"
          $size="sm"
          disabled={busy}
          onClick={() => void turnOff()}
        >
          Turn off for this device
        </Button>
      </Stack>
    )
  } else {
    content = (
      <Stack $gap={4} $align="start">
        <Muted>
          Get a notification when a chore needs approving, something is put down for you, or a
          reward is given.
        </Muted>
        {pushPermission() === 'denied' && (
          <Muted>Notifications are blocked for this site in your browser’s settings.</Muted>
        )}
        <Checkbox checked={showDetails} onChange={(e) => setShowDetails(e.target.checked)}>
          Show what it’s about on the lock screen
        </Checkbox>
        <Muted>Off by default: the lock screen just says “Something new for you”.</Muted>
        <Row>
          <Button type="button" $variant="secondary" disabled={busy} onClick={() => void turnOn()}>
            {busy ? 'Turning on…' : 'Turn on notifications'}
          </Button>
        </Row>
      </Stack>
    )
  }

  return (
    <Card $padding="lg" id="notifications">
      <Stack $gap={4}>
        <CardTitle>Notifications on this device</CardTitle>
        {content}
        {(problem ?? update.error) && (
          <ErrorText role="alert">{problem ?? apiErrorMessage(update.error)}</ErrorText>
        )}
      </Stack>
    </Card>
  )
}
