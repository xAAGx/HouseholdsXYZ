import { emailSchema } from '@households/shared'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'

import { Button, Muted, Stack, TextField } from '../components/ui'
import { CardPage } from '../components/app/CardPage'
import { describeAuthError } from '../features/auth/errors'
import { supabase } from '../lib/supabase'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = emailSchema.safeParse(email)
    if (!parsed.success) return setError(parsed.error.issues[0]?.message)

    setBusy(true)
    setError(undefined)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      // The email links to {{ .RedirectTo }}/auth/confirm (see supabase/templates).
      redirectTo: window.location.origin,
    })
    setBusy(false)

    // Only rate limits are worth showing; anything else would hint at whether
    // the account exists.
    if (resetError?.status === 429) return setError(describeAuthError(resetError).message)
    setSentTo(parsed.data)
  }

  if (sentTo) {
    return (
      <CardPage
        title="Check your email"
        intro={
          <>
            If there’s an account for <strong>{sentTo}</strong>, we’ve sent a link to choose a new
            password. The link expires in one hour.
          </>
        }
      >
        <Muted>Nothing there? Check your spam folder, or wait a minute and try again.</Muted>
        <Link to="/sign-in">Back to sign in</Link>
      </CardPage>
    )
  }

  return (
    <CardPage
      title="Reset your password"
      intro="Enter the email you signed up with and we’ll send you a link to choose a new password."
    >
      <form onSubmit={onSubmit} noValidate>
        <Stack $gap={5}>
          <TextField
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error}
          />
          <Button type="submit" $size="lg" $fullWidth disabled={busy}>
            {busy ? 'Sending…' : 'Email me a reset link'}
          </Button>
          <Link to="/sign-in">Back to sign in</Link>
        </Stack>
      </form>
    </CardPage>
  )
}
