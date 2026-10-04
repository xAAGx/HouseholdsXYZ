import {
  createRecipeInputSchema,
  RECIPE_TAG_SUGGESTIONS,
  splitItemLines,
  type CreateRecipeInput,
  type Recipe,
  type RecipeDraft,
} from '@households/shared'
import { useState, type FormEvent } from 'react'
import styled from 'styled-components'

import {
  Button,
  ChipButton,
  ChipGroup,
  ErrorText,
  FieldGroup,
  Muted,
  Row,
  Stack,
  TextArea,
  TextField,
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'

interface Fields {
  title: string
  ingredients: string
  method: string
  servings: string
  sourceUrl: string
  tags: string[]
  otherTags: string
}

function fieldsOf(recipe: Recipe | null): Fields {
  return {
    title: recipe?.title ?? '',
    ingredients: recipe?.ingredients.join('\n') ?? '',
    method: recipe?.method ?? '',
    servings: recipe?.servings ? String(recipe.servings) : '',
    sourceUrl: recipe?.sourceUrl ?? '',
    tags: recipe?.tags ?? [],
    otherTags: '',
  }
}

function toInput(fields: Fields): CreateRecipeInput {
  const extra = fields.otherTags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
  return {
    title: fields.title,
    ingredients: splitItemLines(fields.ingredients),
    method: fields.method,
    servings: fields.servings ? Number(fields.servings) : null,
    sourceUrl: fields.sourceUrl,
    tags: [...new Set([...fields.tags, ...extra])],
  }
}

/**
 * Adds or edits a recipe. New ones can be filled in from a recipe page's link
 * (Paprika-style); the person checks everything before saving.
 */
export function RecipeForm({
  recipe = null,
  knownTags = [],
  busy,
  error,
  submitLabel,
  onSave,
  onCancel,
  onImport,
}: {
  recipe?: Recipe | null
  /** Tags already used in the household, offered alongside the suggestions. */
  knownTags?: string[]
  busy: boolean
  error: unknown
  submitLabel: string
  onSave: (input: CreateRecipeInput) => Promise<void>
  onCancel: () => void
  /** Reads a recipe from a link; only offered when adding. */
  onImport?: (url: string) => Promise<RecipeDraft>
}) {
  const [fields, setFields] = useState(() => fieldsOf(recipe))
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({})
  const [link, setLink] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<unknown>(null)
  const [imported, setImported] = useState(false)
  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setFields((current) => ({ ...current, [key]: value }))
  const offered = [...new Set([...RECIPE_TAG_SUGGESTIONS, ...knownTags, ...fields.tags])]

  async function fillIn() {
    if (!onImport || !link.trim()) return
    setImporting(true)
    setImportError(null)
    try {
      const draft = await onImport(link.trim())
      setFields((current) => ({
        ...current,
        title: draft.title,
        ingredients: draft.ingredients.join('\n'),
        method: draft.method ?? '',
        servings: draft.servings ? String(draft.servings) : current.servings,
        sourceUrl: draft.sourceUrl,
      }))
      setImported(true)
    } catch (caught) {
      setImportError(caught)
    } finally {
      setImporting(false)
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const input = toInput(fields)
    const parsed = createRecipeInputSchema.safeParse(input)
    if (!parsed.success) {
      const next: typeof errors = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof Fields | undefined
        if (field && !next[field]) next[field] = issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    try {
      await onSave(input)
    } catch {
      // Shown below.
    }
  }

  return (
    <Stack $gap={4}>
      {onImport && (
        <FieldGroup legend="From a recipe page">
          <Stack $gap={2}>
            <TextField
              label="Link (optional)"
              type="url"
              placeholder="https://"
              value={link}
              maxLength={500}
              onChange={(e) => setLink(e.target.value)}
              hint="Most recipe sites work. Check what comes in before saving."
            />
            <Row>
              <Button
                type="button"
                $variant="secondary"
                $size="sm"
                disabled={!link.trim() || importing}
                onClick={() => void fillIn()}
              >
                {importing ? 'Reading the page…' : 'Fill in from the page'}
              </Button>
            </Row>
            {imported && (
              <Muted role="status">Filled in. Check it over, then add the recipe.</Muted>
            )}
            {Boolean(importError) && (
              <ErrorText role="alert">{apiErrorMessage(importError)}</ErrorText>
            )}
          </Stack>
        </FieldGroup>
      )}
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <Stack $gap={3}>
          <TextField
            label="Recipe"
            placeholder="Chickpea curry"
            value={fields.title}
            maxLength={120}
            onChange={(e) => set('title', e.target.value)}
            error={errors.title}
          />
          <TextArea
            label="Ingredients"
            hint="One per line, with amounts: “2 onions”, “400g chickpeas”."
            rows={6}
            value={fields.ingredients}
            onChange={(e) => set('ingredients', e.target.value)}
            error={errors.ingredients}
          />
          <TextArea
            label="Method (optional)"
            hint="One step per line."
            rows={5}
            value={fields.method}
            maxLength={6000}
            onChange={(e) => set('method', e.target.value)}
            error={errors.method}
          />
          <ServingsField>
            <TextField
              label="Serves (optional)"
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              value={fields.servings}
              onChange={(e) => set('servings', e.target.value)}
              error={errors.servings}
            />
          </ServingsField>
          <ChipGroup label="Tags (optional)" error={errors.tags}>
            {offered.map((tag) => (
              <ChipButton
                key={tag}
                pressed={fields.tags.includes(tag)}
                onClick={() =>
                  set(
                    'tags',
                    fields.tags.includes(tag)
                      ? fields.tags.filter((item) => item !== tag)
                      : [...fields.tags, tag],
                  )
                }
              >
                {tag}
              </ChipButton>
            ))}
          </ChipGroup>
          <TextField
            label="Other tags (optional)"
            placeholder="Spicy, Sunday lunch"
            hint="Separate them with commas."
            value={fields.otherTags}
            maxLength={200}
            onChange={(e) => set('otherTags', e.target.value)}
          />
          <TextField
            label="Where it’s from (optional)"
            type="url"
            placeholder="https://"
            value={fields.sourceUrl}
            maxLength={500}
            onChange={(e) => set('sourceUrl', e.target.value)}
            error={errors.sourceUrl}
          />
          {Boolean(error) && <ErrorText role="alert">{apiErrorMessage(error)}</ErrorText>}
          <Row>
            <Button type="submit" $size="sm" disabled={busy}>
              {submitLabel}
            </Button>
            <Button type="button" $variant="ghost" $size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </Row>
        </Stack>
      </form>
    </Stack>
  )
}

const ServingsField = styled.div`
  width: 180px;
`
