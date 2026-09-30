import type { EmailOtpType } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { Muted, Stack } from '../components/ui'
import { CardPage } from '../components/app/CardPage'
import { supabase } from '../lib/supabase'

/** Link types our email templates send here. Anything else is ignored. */
const ALLOWED_TYPES: readonly EmailOtpType[] = ['email', 'recovery', 'email_change']

function isAllowedType(type: string | null): type is EmailOtpType {
  return ALLOWED_TYPES.some((allowed) => allowed === type)
}

/**
 * /auth/confirm?token_hash=…&type=…: the target of every auth email link
 * (confirm sign-up, reset password, change email). Uses a token hash rather
 * than a code, so links work on any device, not just the one that asked.
 */
export function AuthConfirmPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  const started = useRef(false)

  const tokenHash = params.get('token_hash')
  const type = params.get('type')
  const validLink = Boolean(tokenHash) && isAllowedType(type)

  useEffect(() => {
    if (!tokenHash || !isAllowedType(type)) return
    if (started.current) return // StrictMode runs effects twice; a token works once.
    started.current = true

    void supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error }) => {
      if (error) {
        setFailed(true)
        return
      }
      // `replace` also drops the one-time token from the browser history.
      void navigate(type === 'recovery' ? '/reset-password' : '/app', { replace: true })
    })
  }, [tokenHash, type, navigate])

  if (!validLink || failed) {
    return (
      <CardPage
        title="That link didn’t work"
        intro="It may have expired or already been used. Links from our emails work once and expire after an hour."
      >
        <Stack $gap={3}>
          <Link to="/sign-in">Sign in</Link>
          <Link to="/forgot-password">Send a new password reset link</Link>
        </Stack>
      </CardPage>
    )
  }

  return (
    <CardPage title="One moment…">
      <Muted>Checking your link.</Muted>
    </CardPage>
  )
}
