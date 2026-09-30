import { resetPasswordInputSchema } from '@households/shared'
import { useState, type FormEvent } from 'react'
import styled from 'styled-components'

import {
  Button,
  Card,
  CardTitle,
  ConfirmButton,
  CopyField,
  ErrorText,
  Muted,
  PasswordField,
  Row,
  Stack,
  StatusText,
  Text,
  TextField,
} from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { describeAuthError } from '../auth/errors'
import { useMfaFactors, useRefreshMfaFactors } from './queries'

/**
 * Changing the password. If the session isn't fresh, Supabase asks for a
 * one-time code it emails first (reauthentication).
 */
export function PasswordSection() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nonce, setNonce] = useState('')
  const [needsNonce, setNeedsNonce] = useState(false)
  const [errors, setErrors] = useState<{
    password?: string
    confirmPassword?: string
    form?: string
  }>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = resetPasswordInputSchema.safeParse({ password, confirmPassword })
    if (!parsed.success) {
      const next: typeof errors = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as 'password' | 'confirmPassword'
        next[field] ??= issue.message
      }
      setErrors(next)
      return
    }
    setBusy(true)
    setErrors({})
    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
      ...(needsNonce && nonce ? { nonce: nonce.trim() } : {}),
    })
    if (error?.code === 'reauthentication_needed') {
      await supabase.auth.reauthenticate()
      setNeedsNonce(true)
      setBusy(false)
      return
    }
    setBusy(false)
    if (error) {
      setErrors({ form: describeAuthError(error).message })
      return
    }
    setDone(true)
    setPassword('')
    setConfirmPassword('')
    setNonce('')
    setNeedsNonce(false)
  }

  return (
    <Card $padding="lg">
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <Stack $gap={4}>
          <CardTitle>Password</CardTitle>
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
          {needsNonce && (
            <TextField
              label="Code from your email"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={nonce}
              onChange={(e) => setNonce(e.target.value)}
              hint="For your security, we emailed you a code to confirm it's you."
            />
          )}
          {errors.form && <ErrorText role="alert">{errors.form}</ErrorText>}
          <Row>
            <Button type="submit" $variant="secondary" disabled={busy}>
              {busy ? 'Saving…' : 'Change password'}
            </Button>
            {done && <Muted role="status">Password changed. We emailed you to let you know.</Muted>}
          </Row>
        </Stack>
      </form>
    </Card>
  )
}

/** Two-step sign-in with an authenticator app (TOTP). */
export function TwoStepSection() {
  const factors = useMfaFactors()
  const refresh = useRefreshMfaFactors()
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(
    null,
  )
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const verified = factors.data?.filter((factor) => factor.status === 'verified') ?? []

  async function start() {
    setBusy(true)
    setError(undefined)
    // An abandoned earlier attempt would block a new one.
    for (const factor of factors.data ?? []) {
      if (factor.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: factor.id })
    }
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Authenticator app',
    })
    setBusy(false)
    if (enrollError) {
      setError('We couldn’t start two-step sign-in. Please try again.')
      return
    }
    setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }

  async function confirm(event: FormEvent) {
    event.preventDefault()
    if (!enrolling) return
    const digits = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(digits)) {
      setError('Enter the 6-digit code from the app.')
      return
    }
    setBusy(true)
    setError(undefined)
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrolling.id,
      code: digits,
    })
    setBusy(false)
    if (verifyError) {
      setError('That code didn’t work. Codes change every 30 seconds: try the current one.')
      return
    }
    setEnrolling(null)
    setCode('')
    await refresh()
  }

  async function remove(factorId: string) {
    setBusy(true)
    const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId })
    setBusy(false)
    if (removeError) {
      setError('We couldn’t turn it off. Sign in again, then try once more.')
      return
    }
    await refresh()
  }

  return (
    <Card $padding="lg">
      <Stack $gap={4}>
        <Stack $gap={1}>
          <Row $gap={3}>
            <CardTitle>Two-step sign-in</CardTitle>
            {verified.length > 0 ? (
              <StatusText $status="success">On</StatusText>
            ) : (
              <StatusText $status="warning">Off</StatusText>
            )}
          </Row>
          <Muted>
            After your password, you also enter a code from an authenticator app. A stolen password
            alone then can’t open your households.
          </Muted>
        </Stack>

        {verified.length > 0 && !enrolling && (
          <Stack $gap={2} $align="start">
            <ConfirmButton
              message="Turn off two-step sign-in? Your password alone will be enough to sign in again."
              confirmLabel="Yes, turn it off"
              busy={busy}
              onConfirm={() => void remove(verified[0]!.id)}
            >
              Turn off
            </ConfirmButton>
          </Stack>
        )}

        {verified.length === 0 && !enrolling && (
          <Row>
            <Button
              type="button"
              $variant="secondary"
              disabled={busy || factors.isPending}
              onClick={() => void start()}
            >
              Turn on
            </Button>
          </Row>
        )}

        {enrolling && (
          <form onSubmit={(e) => void confirm(e)} noValidate>
            <Stack $gap={4}>
              <Text>
                Scan this with an authenticator app (like 1Password, Google Authenticator or Authy),
                then enter the code it shows.
              </Text>
              <Qr
                src={enrolling.qr}
                alt="QR code to add Households.xyz to your authenticator app"
              />
              <CopyField
                label="Or type this key into the app"
                value={enrolling.secret}
                hint="Keep it private: it's as sensitive as a password."
              />
              <TextField
                label="Code from the app"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <Row>
                <Button type="submit" disabled={busy}>
                  {busy ? 'Checking…' : 'Turn on two-step sign-in'}
                </Button>
                <Button type="button" $variant="ghost" onClick={() => setEnrolling(null)}>
                  Cancel
                </Button>
              </Row>
            </Stack>
          </form>
        )}
        {error && <ErrorText role="alert">{error}</ErrorText>}
      </Stack>
    </Card>
  )
}

export function SessionsSection() {
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function signOutOthers() {
    setBusy(true)
    await supabase.auth.signOut({ scope: 'others' })
    setBusy(false)
    setDone(true)
  }

  return (
    <Card $padding="lg">
      <Stack $gap={3} $align="start">
        <CardTitle>Devices</CardTitle>
        <Muted>Lost a phone, or signed in somewhere you shouldn’t stay signed in?</Muted>
        <Button
          type="button"
          $variant="secondary"
          disabled={busy}
          onClick={() => void signOutOthers()}
        >
          Sign out everywhere else
        </Button>
        {done && <Muted role="status">Done. Only this device is still signed in.</Muted>}
      </Stack>
    </Card>
  )
}

const Qr = styled.img`
  width: 180px;
  height: 180px;
  padding: ${({ theme }) => theme.space[2]}px;
  border: ${({ theme }) => theme.borderWidths.outline}px solid
    ${({ theme }) => theme.colors.outline};
  border-radius: ${({ theme }) => theme.radii.md}px;
  background: ${({ theme }) => theme.colors.surface};
`
