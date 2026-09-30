import {
  emailSchema,
  updatePhoneInputSchema,
  updateProfileInputSchema,
  type MyProfile,
} from '@households/shared'
import { useState, type FormEvent } from 'react'

import {
  Button,
  Card,
  CardTitle,
  ErrorText,
  Grid,
  Muted,
  Row,
  Stack,
  StatusText,
  Text,
  TextField,
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'
import { formatFullDay } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { locationFromPlace, type LocationValue } from '../places/location'
import { LocationPicker } from '../places/LocationPicker'
import { useAccountDetails, useUpdatePhone, useUpdateProfile } from './queries'

export function ProfileSection({ me }: { me: MyProfile }) {
  const [firstName, setFirstName] = useState(me.firstName ?? '')
  const [lastName, setLastName] = useState(me.lastName ?? '')
  const [location, setLocation] = useState<LocationValue>(() =>
    locationFromPlace(me.place, me.cityId),
  )
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string; cityId?: string }>(
    {},
  )
  const update = useUpdateProfile()

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = updateProfileInputSchema.safeParse({
      firstName,
      lastName,
      cityId: location.city?.id,
    })
    if (!parsed.success) {
      const next: typeof errors = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if ((field === 'firstName' || field === 'lastName' || field === 'cityId') && !next[field]) {
          next[field] = issue.message
        }
      }
      setErrors(next)
      return
    }
    setErrors({})
    update.mutate(parsed.data)
  }

  return (
    <Card $padding="lg">
      <form onSubmit={onSubmit} noValidate>
        <Stack $gap={4}>
          <Stack $gap={1}>
            <CardTitle>Profile</CardTitle>
            <Muted>Your name is shown to people in your households.</Muted>
          </Stack>
          <Grid $columns={2} $gap={4}>
            <TextField
              label="First name"
              autoComplete="given-name"
              value={firstName}
              maxLength={50}
              onChange={(e) => setFirstName(e.target.value)}
              error={errors.firstName}
            />
            <TextField
              label="Last name"
              autoComplete="family-name"
              value={lastName}
              maxLength={50}
              onChange={(e) => setLastName(e.target.value)}
              error={errors.lastName}
            />
          </Grid>
          <LocationPicker
            value={location}
            onChange={setLocation}
            errors={{ city: errors.cityId }}
            hint="Your home city. Used to fill in new households; never shown on its own."
          />
          {update.isError && <ErrorText role="alert">{apiErrorMessage(update.error)}</ErrorText>}
          <Row>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save profile'}
            </Button>
            {update.isSuccess && <Muted role="status">Saved.</Muted>}
          </Row>
        </Stack>
      </form>
    </Card>
  )
}

/** Private details: date of birth (read-only) and phone. */
export function PersonalDetailsSection({ me }: { me: MyProfile }) {
  const details = useAccountDetails()
  const update = useUpdatePhone()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string>()

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = updatePhoneInputSchema.safeParse({
      countryCode: me.place?.countryCode ?? '',
      phone,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message)
      return
    }
    setError(undefined)
    update.mutate(
      { countryCode: me.place?.countryCode ?? '', phone },
      { onSuccess: () => setPhone('') },
    )
  }

  return (
    <Card $padding="lg">
      <Stack $gap={4}>
        <Stack $gap={1}>
          <CardTitle>Personal details</CardTitle>
          <Muted>Only you can see these. Not even the people in your households.</Muted>
        </Stack>
        {details.isPending && <Muted>Loading…</Muted>}
        {details.data && (
          <>
            <Stack $gap={1}>
              <Text>Date of birth: {formatFullDay(details.data.dateOfBirth)}</Text>
              <Muted>To correct it, contact support.</Muted>
            </Stack>
            <Row $gap={3}>
              <Text>Phone: {details.data.phone}</Text>
              {details.data.phoneVerified ? (
                <StatusText $status="success">Verified</StatusText>
              ) : (
                <StatusText $status="warning">Not verified yet</StatusText>
              )}
            </Row>
          </>
        )}
        <form onSubmit={onSubmit} noValidate>
          <Stack $gap={3}>
            <TextField
              label="New phone number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              hint="Include your area code, or start with + and the country code."
              error={error}
            />
            {update.isError && <ErrorText role="alert">{apiErrorMessage(update.error)}</ErrorText>}
            <Row>
              <Button type="submit" $variant="secondary" disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Change phone'}
              </Button>
              {update.isSuccess && <Muted role="status">Saved.</Muted>}
            </Row>
          </Stack>
        </form>
      </Stack>
    </Card>
  )
}

/** Email changes are confirmed from both inboxes (Supabase Auth). */
export function EmailSection({ email }: { email: string }) {
  const [next, setNext] = useState('')
  const [error, setError] = useState<string>()
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = emailSchema.safeParse(next)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message)
      return
    }
    setBusy(true)
    setError(undefined)
    const { error: updateError } = await supabase.auth.updateUser(
      { email: parsed.data },
      { emailRedirectTo: window.location.origin },
    )
    setBusy(false)
    if (updateError) {
      setError('We couldn’t change your email right now. Please try again later.')
      return
    }
    setSent(true)
  }

  return (
    <Card $padding="lg">
      <Stack $gap={4}>
        <Stack $gap={1}>
          <CardTitle>Email</CardTitle>
          <Muted>You sign in with {email}.</Muted>
        </Stack>
        {sent ? (
          <Text>
            Check both inboxes: we sent a link to your current and your new address. The change
            happens once both are confirmed.
          </Text>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} noValidate>
            <Stack $gap={3}>
              <TextField
                label="New email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                error={error}
              />
              <Row>
                <Button type="submit" $variant="secondary" disabled={busy}>
                  {busy ? 'Sending…' : 'Change email'}
                </Button>
              </Row>
            </Stack>
          </form>
        )}
      </Stack>
    </Card>
  )
}
