import { unwrap } from '@households/api-client'
import { childSignInCodeSchema, normalizeChildCode } from '@households/shared'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'

import { CardPage } from '../components/app/CardPage'
import { Button, Stack, TextField } from '../components/ui'
import { useAuth } from '../features/auth/auth-context'
import { api } from '../lib/api'
import { apiErrorMessage } from '../lib/api-errors'
import { supabase } from '../lib/supabase'

/** Shows what's typed as ABCD-EFGH, whatever the child types. */
function formatWhileTyping(input: string): string {
  const code = normalizeChildCode(input).slice(0, 8)
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

/**
 * /sign-in/child. Children don't have passwords: a parent shows them a
 * one-time code on the household page. The API swaps the code for a one-time
 * token, which Supabase turns into a session on this device.
 */
export function ChildSignInPage() {
  const { status } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  if (status === 'signed-in') return <Navigate to="/app" replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = childSignInCodeSchema.safeParse(code)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message)
      return
    }

    setBusy(true)
    setError(undefined)
    try {
      const { tokenHash } = await unwrap(
        api.auth['child-sign-in'].$post({ json: { code: parsed.data } }),
      )
      const { error: authError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'email',
      })
      if (authError) throw authError
      await navigate('/app', { replace: true })
    } catch (failure) {
      setError(apiErrorMessage(failure))
      setBusy(false)
    }
  }

  return (
    <CardPage
      title="Child sign in"
      intro="Ask a parent to open your household page and show you a sign-in code."
    >
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <Stack $gap={5}>
          <TextField
            label="Sign-in code"
            placeholder="ABCD-EFGH"
            value={code}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={9}
            onChange={(e) => setCode(formatWhileTyping(e.target.value))}
            error={error}
          />
          <Button type="submit" $size="lg" $fullWidth disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          <Link to="/sign-in">Not a child? Sign in with your email</Link>
        </Stack>
      </form>
    </CardPage>
  )
}
