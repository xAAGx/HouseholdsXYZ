import { EMAIL_OTP_LENGTH, emailOtpSchema, emailSchema, safeInternalPath } from '@households/shared'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'

import { AppHeader } from '../components/app/AppHeader'
import { Button, Card, Page, PageTitle, Stack, Text, TextField } from '../components/ui'
import { useAuth } from '../features/auth/auth-context'
import { supabase } from '../lib/supabase'

type Step = 'email' | 'code'

/**
 * Passwordless sign-in with a one-time code. There is no password to reuse or
 * leak, and no clickable login link to phish.
 */
export function SignInPage() {
  const { status } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const returnTo = safeInternalPath(params.get('returnTo'), '/app')

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  if (status === 'signed-in') return <Navigate to={returnTo} replace />

  async function sendCode(event: FormEvent) {
    event.preventDefault()
    const parsed = emailSchema.safeParse(email)
    if (!parsed.success) return setError(parsed.error.issues[0]?.message)

    setBusy(true)
    setError(undefined)
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: { shouldCreateUser: true },
    })
    setBusy(false)

    if (otpError?.status === 429) {
      return setError('Too many attempts. Please wait a minute and try again.')
    }
    // Same next step whether or not an account exists, so this form can't be
    // used to find out who has an account.
    setEmail(parsed.data)
    setStep('code')
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault()
    const parsed = emailOtpSchema.safeParse(code)
    if (!parsed.success) return setError(parsed.error.issues[0]?.message)

    setBusy(true)
    setError(undefined)
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: parsed.data,
      type: 'email',
    })
    setBusy(false)

    if (verifyError) return setError('That code is invalid or has expired.')
    await navigate(returnTo, { replace: true })
  }

  return (
    <>
      <AppHeader />
      <Page $narrow>
        <Card $padding="lg">
          {step === 'email' ? (
            <form onSubmit={sendCode} noValidate>
              <Stack $gap={5}>
                <Stack $gap={2}>
                  <PageTitle>Sign in</PageTitle>
                  <Text>We’ll email you a one-time code. No password needed.</Text>
                </Stack>
                <TextField
                  label="Email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  error={error}
                />
                <Button type="submit" $size="lg" $fullWidth disabled={busy}>
                  {busy ? 'Sending…' : 'Email me a code'}
                </Button>
              </Stack>
            </form>
          ) : (
            <form onSubmit={verifyCode} noValidate>
              <Stack $gap={5}>
                <Stack $gap={2}>
                  <PageTitle>Check your email</PageTitle>
                  <Text>
                    If {email} can sign in, a {EMAIL_OTP_LENGTH}-digit code is on its way. It
                    expires in 10 minutes.
                  </Text>
                </Stack>
                <TextField
                  label="Code"
                  name="code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={EMAIL_OTP_LENGTH}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  error={error}
                />
                <Stack $gap={2}>
                  <Button type="submit" $size="lg" $fullWidth disabled={busy}>
                    {busy ? 'Checking…' : 'Sign in'}
                  </Button>
                  <Button
                    $variant="ghost"
                    $fullWidth
                    onClick={() => {
                      setStep('email')
                      setCode('')
                      setError(undefined)
                    }}
                  >
                    Use a different email
                  </Button>
                </Stack>
              </Stack>
            </form>
          )}
        </Card>
      </Page>
    </>
  )
}
