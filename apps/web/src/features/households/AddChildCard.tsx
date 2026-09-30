import { addChildInputSchema } from '@households/shared'
import { useState, type FormEvent } from 'react'

import {
  Button,
  Card,
  CardTitle,
  ErrorText,
  Muted,
  Stack,
  Text,
  TextField,
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import { ChildCode } from './ChildCode'
import { useAddChild } from './queries'

/**
 * Parent-managed child accounts: no email, no password, no location. The
 * parent creates the account and shows the child a one-time code.
 */
export function AddChildCard({ householdId }: { householdId: string }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const addChild = useAddChild(householdId)
  const created = addChild.data

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = addChildInputSchema.safeParse({ displayName: name })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message)
      return
    }
    setError(undefined)
    try {
      await addChild.mutateAsync(parsed.data)
      setName('')
    } catch {
      // Shown below from addChild.error.
    }
  }

  return (
    <Card $padding="lg">
      <Stack $gap={4}>
        <Stack $gap={2}>
          <CardTitle>Add a child account</CardTitle>
          <Muted>
            No email or password needed. You create the account, then show your child a code to sign
            in with. Only this household can see them.
          </Muted>
        </Stack>

        {created ? (
          <Stack $gap={4}>
            <Text>
              <strong>{created.child.displayName}</strong>’s account is ready.
            </Text>
            <ChildCode
              childName={created.child.displayName}
              code={created.signIn.code}
              expiresAt={created.signIn.expiresAt}
            />
            <Button type="button" $variant="secondary" onClick={() => addChild.reset()}>
              Add another child
            </Button>
          </Stack>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} noValidate>
            <Stack $gap={4}>
              <TextField
                label="Child’s first name"
                value={name}
                maxLength={50}
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
                hint="Shown to members of this household only."
                error={error}
              />
              {addChild.isError && (
                <ErrorText role="alert">{apiErrorMessage(addChild.error)}</ErrorText>
              )}
              <Button type="submit" $fullWidth disabled={addChild.isPending}>
                {addChild.isPending ? 'Creating…' : 'Add child'}
              </Button>
            </Stack>
          </form>
        )}
      </Stack>
    </Card>
  )
}
