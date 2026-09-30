import { safeInternalPath, signInInputSchema } from '@households/shared'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import styled from 'styled-components'

import { Button, ErrorText, PasswordField, Stack, TextField } from '../components/ui'
import { CardPage } from '../components/app/CardPage'
import { useAuth } from '../features/auth/auth-context'
import { describeAuthError } from '../features/auth/errors'
import { supabase } from '../lib/supabase'

type Errors = Partial<Record<'email' | 'password' | 'form', string>>

export function SignInPage() {
  const { status } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const returnTo = safeInternalPath(params.get('returnTo'), '/app')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)

  if (status === 'signed-in') return <Navigate to={returnTo} replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = signInInputSchema.safeParse({ email, password })
    if (!parsed.success) {
      const next: Errors = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as 'email' | 'password'
        next[field] ??= issue.message
      }
      setErrors(next)
      return
    }

    setBusy(true)
    setErrors({})
    const { error } = await supabase.auth.signInWithPassword(parsed.data)
    setBusy(false)

    if (error) {
      const { field, message } = describeAuthError(error)
      setErrors({ [field]: message })
      return
    }
    await navigate(returnTo, { replace: true })
  }

  return (
    <CardPage
      title="Sign in"
      intro={
        <>
          New here? <Link to="/sign-up">Create an account</Link>
        </>
      }
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
            error={errors.email}
          />
          <Stack $gap={2}>
            <PasswordField
              label="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
            />
            <Forgot to="/forgot-password">Forgot your password?</Forgot>
          </Stack>
          {errors.form && <ErrorText role="alert">{errors.form}</ErrorText>}
          <Button type="submit" $size="lg" $fullWidth disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </Stack>
      </form>
    </CardPage>
  )
}

const Forgot = styled(Link)`
  align-self: flex-start;
  font-size: ${({ theme }) => theme.fontSizes.sm}px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`
