import {
  ApiError,
  householdPath,
  isMinorRole,
  moveHouseholdInputSchema,
  updateHouseholdInputSchema,
  type HouseholdDetail,
  type MyMembership,
} from '@households/shared'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'

import { AppHeader } from '../components/app/AppHeader'
import {
  Button,
  ButtonLink,
  Card,
  CardTitle,
  ConfirmButton,
  ErrorText,
  Muted,
  Page,
  PageTitle,
  Row,
  Select,
  Stack,
  Text,
  TextArea,
  TextField,
} from '../components/ui'
import {
  useDeleteHousehold,
  useHouseholdView,
  useLeaveHousehold,
  useMoveHousehold,
  useUpdateHousehold,
} from '../features/households/queries'
import { locationFromPlace, type LocationValue } from '../features/places/location'
import { LocationPicker } from '../features/places/LocationPicker'
import { apiErrorMessage } from '../lib/api-errors'
import { NotFoundPage } from './NotFoundPage'

/** /:country/:region/:city/:name/settings, for adult members. */
export function HouseholdSettingsPage() {
  const params = useParams()
  const view = useHouseholdView(
    {
      country: params.country ?? '',
      region: params.region ?? '',
      city: params.city ?? '',
      name: params.name ?? '',
    },
    true,
  )

  if (view.isPending) {
    return (
      <Page $medium>
        <Muted>Loading…</Muted>
      </Page>
    )
  }
  if (view.isError) return <NotFoundPage />
  if (view.data.kind === 'moved') return <Navigate to={`${view.data.path}/settings`} replace />
  if (view.data.kind !== 'member' || isMinorRole(view.data.myRole)) return <NotFoundPage />

  return (
    <Settings
      household={view.data.household}
      me={{ role: view.data.myRole, permissions: view.data.permissions }}
    />
  )
}

function Settings({ household, me }: { household: HouseholdDetail; me: MyMembership }) {
  const homePath = household.place ? householdPath(household.place, household.slug) : '/app'
  const canEdit = me.permissions.includes('manage_household')

  return (
    <>
      <AppHeader
        actions={
          <ButtonLink to={homePath} $variant="ghost" $size="sm">
            Back to household
          </ButtonLink>
        }
      />
      <Page $medium>
        <Stack $gap={6}>
          <Stack $gap={2}>
            <PageTitle>Household settings</PageTitle>
            <Muted>{household.name}</Muted>
          </Stack>

          {canEdit ? (
            <>
              <DetailsSection household={household} />
              <AddressSection household={household} />
            </>
          ) : (
            <Text>Only the owner and admins can change the household’s details.</Text>
          )}
          {me.permissions.includes('publish_public') && <VisibilitySection household={household} />}
          {me.role === 'owner' ? (
            <DeleteSection household={household} />
          ) : (
            <LeaveSection household={household} />
          )}
        </Stack>
      </Page>
    </>
  )
}

function DetailsSection({ household }: { household: HouseholdDetail }) {
  const [name, setName] = useState(household.name)
  const [bio, setBio] = useState(household.bio ?? '')
  const [errors, setErrors] = useState<{ name?: string; bio?: string }>({})
  const update = useUpdateHousehold(household.id)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = updateHouseholdInputSchema.safeParse({ name, bio })
    if (!parsed.success) {
      const next: typeof errors = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if ((field === 'name' || field === 'bio') && !next[field]) next[field] = issue.message
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
          <CardTitle>Details</CardTitle>
          <TextField
            label="Household name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
          />
          <TextArea
            label="About your household"
            value={bio}
            maxLength={500}
            onChange={(e) => setBio(e.target.value)}
            hint="Optional. Shown on the public page if you make the household public."
            error={errors.bio}
          />
          {update.isError && <ErrorText role="alert">{apiErrorMessage(update.error)}</ErrorText>}
          <Row>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save details'}
            </Button>
            {update.isSuccess && <Muted role="status">Saved.</Muted>}
          </Row>
        </Stack>
      </form>
    </Card>
  )
}

function AddressSection({ household }: { household: HouseholdDetail }) {
  const navigate = useNavigate()
  const [location, setLocation] = useState<LocationValue>(() =>
    locationFromPlace(household.place, household.cityId),
  )
  const [slug, setSlug] = useState(household.slug)
  const [errors, setErrors] = useState<{ cityId?: string; slug?: string; form?: string }>({})
  const move = useMoveHousehold(household.id)

  const city = location.city
  const preview = city
    ? `households.xyz${householdPath(
        { countryCode: location.countryCode, regionSlug: location.regionSlug, citySlug: city.slug },
        slug || 'YourHousehold',
      )}`
    : 'Choose a city to see the full address.'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = moveHouseholdInputSchema.safeParse({ cityId: city?.id, slug })
    if (!parsed.success) {
      const next: typeof errors = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if ((field === 'cityId' || field === 'slug') && !next[field]) next[field] = issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    try {
      const { path } = await move.mutateAsync(parsed.data)
      await navigate(path ? `${path}/settings` : '/app', { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CONFLICT') {
        setErrors({ slug: `That address is taken in ${city?.name ?? 'this city'}. Try another.` })
      } else {
        setErrors({ form: apiErrorMessage(error) })
      }
    }
  }

  return (
    <Card $padding="lg">
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <Stack $gap={4}>
          <Stack $gap={2}>
            <CardTitle>Address</CardTitle>
            <Muted>
              Moved, or want a different name in the link? Members who open the old address are sent
              to the new one. To everyone else, it simply stops existing.
            </Muted>
          </Stack>
          <LocationPicker
            value={location}
            onChange={setLocation}
            errors={{ city: errors.cityId }}
          />
          <TextField
            label="Web address"
            value={slug}
            maxLength={32}
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => setSlug(e.target.value)}
            hint={preview}
            error={errors.slug}
          />
          {errors.form && <ErrorText role="alert">{errors.form}</ErrorText>}
          <Row>
            <Button type="submit" disabled={move.isPending}>
              {move.isPending ? 'Saving…' : 'Save address'}
            </Button>
          </Row>
        </Stack>
      </form>
    </Card>
  )
}

function VisibilitySection({ household }: { household: HouseholdDetail }) {
  const current = household.visibility === 'public' ? 'public' : 'private'
  const [visibility, setVisibility] = useState<'private' | 'public'>(current)
  const update = useUpdateHousehold(household.id)

  return (
    <Card $padding="lg">
      <Stack $gap={4}>
        <CardTitle>Who can see this household</CardTitle>
        <Select
          label="Visible to"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value === 'public' ? 'public' : 'private')}
          hint={
            visibility === 'public'
              ? 'Anyone with the address sees the name, city and description. Never the members, and never children.'
              : 'Only members can open it. To everyone else, the address looks like it doesn’t exist.'
          }
        >
          <option value="private">Members only</option>
          <option value="public">Public</option>
        </Select>
        {update.isError && <ErrorText role="alert">{apiErrorMessage(update.error)}</ErrorText>}
        <Row>
          <Button
            type="button"
            disabled={visibility === current || update.isPending}
            onClick={() => update.mutate({ visibility })}
          >
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </Row>
      </Stack>
    </Card>
  )
}

function LeaveSection({ household }: { household: HouseholdDetail }) {
  const navigate = useNavigate()
  const leave = useLeaveHousehold(household.id)

  return (
    <Card $padding="lg">
      <Stack $gap={3} $align="start">
        <CardTitle>Leave household</CardTitle>
        <Muted>You lose access right away. Someone can invite you back later.</Muted>
        <ConfirmButton
          message={`Leave ${household.name}? You’ll lose access to it right away.`}
          confirmLabel="Yes, leave"
          busy={leave.isPending}
          onConfirm={() =>
            leave.mutate(undefined, { onSuccess: () => void navigate('/app', { replace: true }) })
          }
        >
          Leave household
        </ConfirmButton>
        {leave.isError && <ErrorText role="alert">{apiErrorMessage(leave.error)}</ErrorText>}
      </Stack>
    </Card>
  )
}

function DeleteSection({ household }: { household: HouseholdDetail }) {
  const navigate = useNavigate()
  const [typed, setTyped] = useState('')
  const remove = useDeleteHousehold(household.id)
  const confirmed = typed.trim() === household.name

  return (
    <Card $padding="lg">
      <Stack $gap={4}>
        <Stack $gap={2}>
          <CardTitle>Delete household</CardTitle>
          <Text>
            This deletes {household.name} for everyone, including the accounts of the children in
            it. It can’t be undone.
          </Text>
        </Stack>
        <TextField
          label={`Type “${household.name}” to confirm`}
          value={typed}
          autoComplete="off"
          onChange={(e) => setTyped(e.target.value)}
        />
        {remove.isError && <ErrorText role="alert">{apiErrorMessage(remove.error)}</ErrorText>}
        <Row>
          <Button
            type="button"
            $variant="danger"
            disabled={!confirmed || remove.isPending}
            onClick={() =>
              remove.mutate(undefined, {
                onSuccess: () => void navigate('/app', { replace: true }),
              })
            }
          >
            {remove.isPending ? 'Deleting…' : 'Delete household'}
          </Button>
        </Row>
      </Stack>
    </Card>
  )
}
