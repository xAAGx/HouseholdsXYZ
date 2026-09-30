import {
  ApiError,
  createHouseholdInputSchema,
  householdPath,
  suggestHouseholdSlug,
} from '@households/shared'
import { useState, type FormEvent } from 'react'
import styled from 'styled-components'

import { Button, ErrorText, FieldGroup, Stack, TextField } from '../../components/ui'
import { EMPTY_LOCATION, type LocationValue } from '../places/location'
import { LocationPicker } from '../places/LocationPicker'
import { useCreateHousehold } from './queries'

type Field = 'name' | 'slug' | 'cityId' | 'form'
type FieldErrors = Partial<Record<Field, string>>

interface CreateHouseholdFormProps {
  /** Usually the person's home city from sign-up. */
  initialLocation?: LocationValue
  onCreated?: () => void
}

export function CreateHouseholdForm({
  initialLocation = EMPTY_LOCATION,
  onCreated,
}: CreateHouseholdFormProps) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [location, setLocation] = useState(initialLocation)
  const [errors, setErrors] = useState<FieldErrors>({})
  const createHousehold = useCreateHousehold()

  const city = location.city
  const preview = city
    ? `households.xyz${householdPath(
        { countryCode: location.countryCode, regionSlug: location.regionSlug, citySlug: city.slug },
        slug || 'YourHousehold',
      )}`
    : 'Choose a city to see the full address.'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    // Same schema the API validates with, so users get instant, identical feedback.
    const parsed = createHouseholdInputSchema.safeParse({ name, slug, cityId: city?.id })
    if (!parsed.success) {
      const next: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field | undefined
        if (field && !next[field]) next[field] = issue.message
      }
      return setErrors(next)
    }

    setErrors({})
    try {
      await createHousehold.mutateAsync(parsed.data)
      onCreated?.()
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CONFLICT') {
        setErrors({ slug: `That address is taken in ${city?.name ?? 'this city'}. Try another.` })
      } else {
        setErrors({ form: error instanceof ApiError ? error.message : 'Something went wrong.' })
      }
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack $gap={5}>
        <TextField
          label="Household name"
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value)
            if (!slugEdited) setSlug(suggestHouseholdSlug(e.target.value))
          }}
          error={errors.name}
        />
        <FieldGroup legend="Where is it?">
          <LocationPicker
            value={location}
            onChange={setLocation}
            errors={{ city: errors.cityId }}
            hint="Part of your household’s address. Only members see it while the household is private."
          />
        </FieldGroup>
        <TextField
          label="Web address"
          value={slug}
          maxLength={32}
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => {
            setSlug(e.target.value)
            setSlugEdited(true)
          }}
          hint={
            <>
              <AddressPreview>{preview}</AddressPreview>
              Private until you choose to publish it.
            </>
          }
          error={errors.slug}
        />
        {errors.form && <ErrorText role="alert">{errors.form}</ErrorText>}
        <Button type="submit" $size="lg" $fullWidth disabled={createHousehold.isPending}>
          {createHousehold.isPending ? 'Creating…' : 'Create household'}
        </Button>
      </Stack>
    </form>
  )
}

/** The full address on its own line; long city names wrap anywhere, not just at hyphens. */
const AddressPreview = styled.span`
  display: block;
  overflow-wrap: anywhere;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`
