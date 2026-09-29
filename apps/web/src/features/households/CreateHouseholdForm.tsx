import {
  ApiError,
  createHouseholdInputSchema,
  householdPath,
  suggestHouseholdSlug,
} from '@households/shared'
import { useState, type FormEvent } from 'react'

import { Button, ErrorText, Stack, TextField } from '../../components/ui'
import { useCreateHousehold } from './queries'

type FieldErrors = Partial<Record<'name' | 'slug' | 'form', string>>

export function CreateHouseholdForm() {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const createHousehold = useCreateHousehold()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    // Same schema the API validates with, so users get instant, identical feedback.
    const parsed = createHouseholdInputSchema.safeParse({ name, slug })
    if (!parsed.success) {
      const next: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if ((field === 'name' || field === 'slug') && !next[field]) next[field] = issue.message
      }
      return setErrors(next)
    }

    setErrors({})
    try {
      await createHousehold.mutateAsync(parsed.data)
      setName('')
      setSlug('')
      setSlugEdited(false)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CONFLICT') {
        setErrors({ slug: 'That address is taken. Try another.' })
      } else {
        setErrors({ form: error instanceof ApiError ? error.message : 'Something went wrong.' })
      }
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack $gap={3}>
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
        <TextField
          label="Address"
          value={slug}
          maxLength={32}
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => {
            setSlug(e.target.value)
            setSlugEdited(true)
          }}
          hint={`households.xyz${householdPath(slug || 'YourHousehold')} · Private until you choose to publish it.`}
          error={errors.slug}
        />
        {errors.form && <ErrorText role="alert">{errors.form}</ErrorText>}
        <Button type="submit" disabled={createHousehold.isPending}>
          {createHousehold.isPending ? 'Creating…' : 'Create household'}
        </Button>
      </Stack>
    </form>
  )
}
