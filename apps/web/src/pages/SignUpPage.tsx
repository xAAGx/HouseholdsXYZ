import {
  MIN_ACCOUNT_AGE,
  phoneCallingCode,
  signUpInputSchema,
  signUpMetadata,
} from '@households/shared'
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'

import {
  Button,
  Checkbox,
  ErrorText,
  FieldGroup,
  Grid,
  Muted,
  PasswordField,
  Stack,
  Text,
  TextField,
} from '../components/ui'
import { CardPage } from '../components/app/CardPage'
import { useAuth } from '../features/auth/auth-context'
import { describeAuthError } from '../features/auth/errors'
import { EMPTY_LOCATION, type LocationValue } from '../features/places/location'
import { LocationPicker } from '../features/places/LocationPicker'
import { supabase } from '../lib/supabase'

type Field =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'password'
  | 'dateOfBirth'
  | 'countryCode'
  | 'cityId'
  | 'phone'
  | 'acceptTerms'
  | 'form'
type Errors = Partial<Record<Field, string>>

/** Latest date of birth that is old enough, for the date picker's max. */
function latestAllowedBirthDate(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - MIN_ACCOUNT_AGE)
  return d.toISOString().slice(0, 10)
}

export function SignUpPage() {
  const { status } = useAuth()
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    dateOfBirth: '',
    phone: '',
  })
  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  if (status === 'signed-in') return <Navigate to="/app" replace />

  const set = (field: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  const callingCode = location.countryCode ? phoneCallingCode(location.countryCode) : null

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = signUpInputSchema.safeParse({
      ...form,
      countryCode: location.countryCode,
      cityId: location.city?.id,
      acceptTerms,
    })
    if (!parsed.success) {
      const next: Errors = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field | undefined
        if (field && !next[field]) next[field] = issue.message
      }
      setErrors(next)
      return
    }

    setBusy(true)
    setErrors({})
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: signUpMetadata(parsed.data),
        // The email links to {{ .RedirectTo }}/auth/confirm, so it comes back to
        // this site (localhost in dev, the real domain in production).
        emailRedirectTo: window.location.origin,
      },
    })
    setBusy(false)

    if (error) {
      const { field, message } = describeAuthError(error)
      setErrors({ [field]: message })
      return
    }
    // Shown whether or not the email already had an account (no enumeration).
    setSentTo(parsed.data.email)
  }

  if (sentTo) {
    return (
      <CardPage
        title="Check your email"
        intro={
          <>
            We sent a link to <strong>{sentTo}</strong>. Open it to confirm your address and finish
            creating your account. It works on any device.
          </>
        }
      >
        <Muted>Nothing there? Check your spam folder, or wait a minute and try again.</Muted>
        <Button $variant="secondary" onClick={() => setSentTo(null)}>
          Use a different email
        </Button>
      </CardPage>
    )
  }

  return (
    <CardPage
      wide
      title="Create your account"
      intro={
        <>
          Already have one? <Link to="/sign-in">Sign in</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <Stack $gap={5}>
          <Grid $columns={2} $gap={4}>
            <TextField
              label="First name"
              autoComplete="given-name"
              value={form.firstName}
              onChange={set('firstName')}
              error={errors.firstName}
            />
            <TextField
              label="Last name"
              autoComplete="family-name"
              value={form.lastName}
              onChange={set('lastName')}
              error={errors.lastName}
            />
          </Grid>

          <TextField
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={form.email}
            onChange={set('email')}
            error={errors.email}
          />

          <PasswordField
            label="Password"
            autoComplete="new-password"
            showRequirements
            value={form.password}
            onChange={set('password')}
            error={errors.password}
          />

          <TextField
            label="Date of birth"
            type="date"
            autoComplete="bday"
            max={latestAllowedBirthDate()}
            value={form.dateOfBirth}
            onChange={set('dateOfBirth')}
            hint={`You need to be ${MIN_ACCOUNT_AGE} or older. Only you can see this.`}
            error={errors.dateOfBirth}
          />

          <FieldGroup legend="Where you live">
            <LocationPicker
              value={location}
              onChange={setLocation}
              errors={{ country: errors.countryCode, city: errors.cityId }}
              hint="Your city helps set up your household. We never ask for your street address."
            />
          </FieldGroup>

          <TextField
            label="Phone number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={set('phone')}
            hint={
              callingCode
                ? `Include your area code. We add ${callingCode} for you. Only you can see this.`
                : 'Choose your country above first. Only you can see this.'
            }
            error={errors.phone}
          />

          <Checkbox
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            error={errors.acceptTerms}
          >
            I agree to the <Link to="/terms">Terms of Service</Link> and{' '}
            <Link to="/privacy">Privacy Policy</Link>.
          </Checkbox>

          {errors.form && <ErrorText role="alert">{errors.form}</ErrorText>}

          <Button type="submit" $size="lg" $fullWidth disabled={busy}>
            {busy ? 'Creating your account…' : 'Create account'}
          </Button>

          <Text>
            Households.xyz accounts are for adults. Children and teens join through a parent’s
            household, where their privacy stays in the parent’s hands.
          </Text>
        </Stack>
      </form>
    </CardPage>
  )
}
