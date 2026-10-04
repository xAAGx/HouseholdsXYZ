import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_FILE_TYPES,
  DOCUMENT_REMIND_OPTIONS,
  documentInputSchema,
  LIST_VISIBILITIES,
  LIST_VISIBILITY_LABELS,
  type DocumentInput,
  type HouseholdMember,
  type ListVisibility,
  type VaultDocument,
} from '@households/shared'
import { useState, type FormEvent } from 'react'

import {
  Button,
  ChipButton,
  ChipGroup,
  ErrorText,
  Grid,
  Muted,
  Row,
  Select,
  Stack,
  TextArea,
  TextField,
} from '../../components/ui'
import { apiErrorMessage } from '../../lib/api-errors'

interface Fields {
  title: string
  category: string
  reference: string
  notes: string
  people: string[]
  expiresOn: string
  remindDays: number
  visibility: ListVisibility
  sharedWith: string[]
}

type Errors = Partial<Record<keyof Fields, string>>

/** What each audience means in the vault (children don't see it by default). */
const VISIBILITY_HINTS: Record<ListVisibility, string> = {
  household: 'Everyone who can see the household’s documents (adults, unless changed).',
  selected_members: 'Only you and the people you pick, children included.',
  private: 'Only you. Nobody else in the household can see it, parents included.',
}

/**
 * Adds or edits a document's details. Files are added separately (on a new
 * document, chosen here and uploaded once it's saved).
 */
export function DocumentForm({
  document,
  members,
  me,
  busy,
  error,
  onSave,
  onCancel,
}: {
  document: VaultDocument | null
  members: HouseholdMember[]
  me: string
  busy: boolean
  error: unknown
  /** New documents also get the files chosen. */
  onSave: (input: DocumentInput, files: File[]) => Promise<void>
  onCancel: () => void
}) {
  const [fields, setFields] = useState<Fields>(() => ({
    title: document?.title ?? '',
    category: document?.category ?? 'Identity',
    reference: document?.reference ?? '',
    notes: document?.notes ?? '',
    people: document?.people ?? [],
    expiresOn: document?.expiresOn ?? '',
    remindDays: document?.remindDays ?? 30,
    visibility: document?.visibility ?? 'household',
    sharedWith: document?.sharedWith ?? [],
  }))
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<Errors>({})
  const isCreator = !document || document.createdBy === me
  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setFields((current) => ({ ...current, [key]: value }))
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id]
  const categories = (DOCUMENT_CATEGORIES as readonly string[]).includes(fields.category)
    ? DOCUMENT_CATEGORIES
    : [fields.category, ...DOCUMENT_CATEGORIES]

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const input: DocumentInput = {
      title: fields.title,
      category: fields.category,
      reference: fields.reference,
      notes: fields.notes,
      people: fields.people,
      expiresOn: fields.expiresOn || null,
      remindDays: fields.remindDays,
      visibility: fields.visibility,
      sharedWith: fields.visibility === 'selected_members' ? fields.sharedWith : [],
    }
    const parsed = documentInputSchema.safeParse(input)
    if (!parsed.success) {
      const next: Errors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Fields | undefined
        if (key && !next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    try {
      await onSave(input, files)
    } catch {
      // Shown below.
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <Stack $gap={4}>
        <Grid $columns={2} $gap={4}>
          <TextField
            label="Document"
            placeholder="Passport"
            value={fields.title}
            maxLength={120}
            onChange={(e) => set('title', e.target.value)}
            error={errors.title}
          />
          <Select
            label="Kind"
            value={fields.category}
            onChange={(e) => set('category', e.target.value)}
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>
          <TextField
            label="Number (optional)"
            hint="Policy, account or document number."
            autoComplete="off"
            value={fields.reference}
            maxLength={80}
            onChange={(e) => set('reference', e.target.value)}
            error={errors.reference}
          />
          <TextField
            label="Expires (optional)"
            type="date"
            value={fields.expiresOn}
            onChange={(e) => set('expiresOn', e.target.value)}
            error={errors.expiresOn}
          />
          {fields.expiresOn && (
            <Select
              label="Remind"
              hint="Also on the day it expires."
              value={String(fields.remindDays)}
              onChange={(e) => set('remindDays', Number(e.target.value))}
            >
              {DOCUMENT_REMIND_OPTIONS.map((option) => (
                <option key={option.days} value={option.days}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Grid>
        <ChipGroup
          label="Whose is it (optional)"
          hint="They get the expiry reminder if they can see it."
          error={errors.people}
        >
          {members.map((member) => (
            <ChipButton
              key={member.profileId}
              pressed={fields.people.includes(member.profileId)}
              onClick={() => set('people', toggle(fields.people, member.profileId))}
            >
              {member.isMe ? `${member.displayName} (you)` : member.displayName}
            </ChipButton>
          ))}
        </ChipGroup>
        <Select
          label="Who can see it"
          value={fields.visibility}
          disabled={!isCreator}
          hint={
            isCreator
              ? VISIBILITY_HINTS[fields.visibility]
              : 'Only the person who added it can change this.'
          }
          onChange={(e) => set('visibility', e.target.value as ListVisibility)}
        >
          {LIST_VISIBILITIES.map((visibility) => (
            <option key={visibility} value={visibility}>
              {LIST_VISIBILITY_LABELS[visibility]}
            </option>
          ))}
        </Select>
        {fields.visibility === 'selected_members' && isCreator && (
          <ChipGroup label="Shared with" error={errors.sharedWith}>
            {members
              .filter((member) => !member.isMe)
              .map((member) => (
                <ChipButton
                  key={member.profileId}
                  pressed={fields.sharedWith.includes(member.profileId)}
                  onClick={() => set('sharedWith', toggle(fields.sharedWith, member.profileId))}
                >
                  {member.displayName}
                </ChipButton>
              ))}
          </ChipGroup>
        )}
        <TextArea
          label="Notes (optional)"
          rows={2}
          value={fields.notes}
          maxLength={2000}
          onChange={(e) => set('notes', e.target.value)}
          error={errors.notes}
        />
        {!document && (
          <Stack $gap={1}>
            <TextField
              label="Files (optional)"
              type="file"
              multiple
              accept={DOCUMENT_FILE_TYPES.join(',')}
              hint="PDFs or photos, up to 20 MB each."
              onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 20))}
            />
            {files.length > 0 && (
              <Muted>{files.length === 1 ? files[0]!.name : `${files.length} files chosen`}</Muted>
            )}
          </Stack>
        )}
        {Boolean(error) && <ErrorText role="alert">{apiErrorMessage(error)}</ErrorText>}
        <Row>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : document ? 'Save' : 'Add to the vault'}
          </Button>
          <Button type="button" $variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </Row>
      </Stack>
    </form>
  )
}
