import { safeInternalPath } from '@households/shared'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'

import { CardPage } from '../components/app/CardPage'
import { Button, Muted, Stack, TextField } from '../components/ui'
import { useAuth } from '../features/auth/auth-context'
import { supabase } from '../lib/supabase'

/**
 * /sign-in/verify: the second step, for people who turned on two-step sign-in.
 * Until it's passed, the database shows the session nothing.
 */
export function MfaVerifyPage() {
  const { status, needsSecondFactor, signOut } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const returnTo = safeInternalPath(params.get('returnTo'), '/app')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  if (status === 'loading') {
    return (
      <CardPage title="Two-step sign-in">
        <Muted>Loading…</Muted>
      </CardPage>
    )
  }
  if (status === 'signed-out') return <Navigate to="/sign-in" replace />
  if (!needsSecondFactor) return <Navigate to={returnTo} replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const digits = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(digits)) {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }
    setBusy(true)
    setError(undefined)
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
    const factor = factors?.totp.find((f) => f.status === 'verified')
    if (listError || !factor) {
      setBusy(false)
      setError('We couldn’t find your authenticator. Please sign in again.')
      return
    }
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: digits,
    })
    setBusy(false)
    if (verifyError) {
      setError('That code didn’t work. Codes change every 30 seconds: try the current one.')
      return
    }
    await navigate(returnTo, { replace: true })
  }

  return (
    <CardPage
      title="Two-step sign-in"
      intro="Open your authenticator app and enter the 6-digit code for Households.xyz."
    >
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <Stack $gap={5}>
          <TextField
            label="Code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={error}
          />
          <Button type="submit" $size="lg" $fullWidth disabled={busy}>
            {busy ? 'Checking…' : 'Continue'}
          </Button>
          <Button type="button" $variant="ghost" onClick={() => void signOut()}>
            Sign out instead
          </Button>
        </Stack>
      </form>
    </CardPage>
  )
}
