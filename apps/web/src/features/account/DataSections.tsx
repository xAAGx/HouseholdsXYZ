import { useState } from 'react'
import { useNavigate } from 'react-router'

import {
  Button,
  Card,
  CardTitle,
  ErrorText,
  Muted,
  Row,
  Stack,
  Text,
  TextField,
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import { useAuth } from '../auth/auth-context'
import { downloadMyData, useDeleteAccount, useDeletionBlockers } from './queries'

/** "Your data, your exit": a copy of everything that's yours. */
export function DataSection() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function download() {
    setBusy(true)
    setError(undefined)
    try {
      await downloadMyData()
    } catch (failure) {
      setError(apiErrorMessage(failure))
    }
    setBusy(false)
  }

  return (
    <Card $padding="lg">
      <Stack $gap={3} $align="start">
        <CardTitle>Your data</CardTitle>
        <Muted>
          Download everything that’s yours: your profile, households, lists, chores and points, as a
          JSON file.
        </Muted>
        <Button type="button" $variant="secondary" disabled={busy} onClick={() => void download()}>
          {busy ? 'Preparing…' : 'Download my data'}
        </Button>
        {error && <ErrorText role="alert">{error}</ErrorText>}
      </Stack>
    </Card>
  )
}

export function DeleteAccountSection({ email }: { email: string }) {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const blockers = useDeletionBlockers()
  const remove = useDeleteAccount()
  const [typed, setTyped] = useState('')
  const confirmed = typed.trim().toLowerCase() === email.toLowerCase()

  async function onDelete() {
    try {
      await remove.mutateAsync()
      await signOut()
      await navigate('/', { replace: true })
    } catch {
      // Shown below.
    }
  }

  return (
    <Card $padding="lg">
      <Stack $gap={4}>
        <Stack $gap={2}>
          <CardTitle>Delete account</CardTitle>
          <Text>
            This deletes your account, your private lists and any household you own on your own. It
            can’t be undone.
          </Text>
        </Stack>

        {blockers.isPending && <Muted>Checking…</Muted>}
        {blockers.data && blockers.data.length > 0 && (
          <Stack $gap={2}>
            <Text>
              First hand over or delete the households you own that have other people in them:
            </Text>
            <ul>
              {blockers.data.map((blocker) => (
                <li key={blocker.householdId}>
                  <Text>
                    {blocker.householdName} ({blocker.otherMembers}{' '}
                    {blocker.otherMembers === 1 ? 'other person' : 'other people'})
                  </Text>
                </li>
              ))}
            </ul>
            <Muted>You can do both from each household’s settings.</Muted>
          </Stack>
        )}

        {blockers.data?.length === 0 && (
          <>
            <TextField
              label={`Type ${email} to confirm`}
              type="email"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            {remove.isError && <ErrorText role="alert">{apiErrorMessage(remove.error)}</ErrorText>}
            <Row>
              <Button
                type="button"
                $variant="danger"
                disabled={!confirmed || remove.isPending}
                onClick={() => void onDelete()}
              >
                {remove.isPending ? 'Deleting…' : 'Delete my account'}
              </Button>
            </Row>
          </>
        )}
      </Stack>
    </Card>
  )
}
