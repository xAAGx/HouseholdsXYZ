import { resetPasswordInputSchema } from '@households/shared'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { Button, ErrorText, Muted, PasswordField, Stack } from '../components/ui'
import { CardPage } from '../components/app/CardPage'
import { useAuth } from '../features/auth/auth-context'
import { describeAuthError } from '../features/auth/errors'
import { supabase } from '../lib/supabase'

type Errors = Partial<Record<'password' | 'confirmPassword' | 'form', string>>

/** Reached from the reset email (via /auth/confirm), which signs the person in. */
export function ResetPasswordPage() {
  const { status } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)

  if (status === 'loading') {
    return (
      <CardPage title="Choose a new password">
        <Muted>Loading…</Muted>
      </CardPage>
    )
  }

  if (status === 'signed-out') {
    return (
      <CardPage
        title="Open the link from your email"
        intro="This page only works from the password reset link we email you."
      >
        <Link to="/forgot-password">Send me a reset link</Link>
      </CardPage>
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = resetPasswordInputSchema.safeParse({ password, confirmPassword })
    if (!parsed.success) {
      const next: Errors = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as 'password' | 'confirmPassword'
        next[field] ??= issue.message
      }
      setErrors(next)
      return
    }

    setBusy(true)
    setErrors({})
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
    setBusy(false)

    if (error) {
      const { field, message } = describeAuthError(error)
      setErrors({ [field === 'email' ? 'form' : field]: message })
      return
    }
    await navigate('/app', { replace: true })
  }

  return (
    <CardPage title="Choose a new password">
      <form onSubmit={onSubmit} noValidate>
        <Stack $gap={5}>
          <PasswordField
            label="New password"
            autoComplete="new-password"
            showRequirements
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          <PasswordField
            label="Type it again"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={errors.confirmPassword}
          />
          {errors.form && <ErrorText role="alert">{errors.form}</ErrorText>}
          <Button type="submit" $size="lg" $fullWidth disabled={busy}>
            {busy ? 'Saving…' : 'Save new password'}
          </Button>
        </Stack>
      </form>
    </CardPage>
  )
}
