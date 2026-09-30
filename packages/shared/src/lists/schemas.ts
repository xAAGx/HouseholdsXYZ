import { Constants, type Enums } from '@households/db'
import { z } from 'zod'

// Lists: to-dos, shopping, packing. The database (lists migration) is the
// authority on who may see and change what; these schemas give forms and the
// API the same rules.

export type ListKind = Enums<'list_kind'>
export const LIST_KINDS = Constants.public.Enums.list_kind

export const LIST_KIND_LABELS: Record<ListKind, string> = {
  todo: 'To-do',
  shopping: 'Shopping',
  packing: 'Packing',
  other: 'Other',
}

/** Who can see a list. Lists never reach beyond the household. */
export const LIST_VISIBILITIES = ['household', 'selected_members', 'private'] as const
export type ListVisibility = (typeof LIST_VISIBILITIES)[number]
export const listVisibilitySchema = z.enum(LIST_VISIBILITIES)

export const LIST_VISIBILITY_LABELS: Record<ListVisibility, string> = {
  household: 'Everyone in the household',
  selected_members: 'People I choose',
  private: 'Only me',
}

export const LIST_VISIBILITY_HINTS: Record<ListVisibility, string> = {
  household: 'Every member can see it. Guests can look but not change it.',
  selected_members: 'Only you and the people you pick.',
  private: 'Only you. Nobody else in the household can see it.',
}

const dateSchema = z.iso.date({ error: 'Choose a real date.' })

export const listTitleSchema = z
  .string()
  .trim()
  .min(1, 'Give the list a name.')
  .max(80, 'Use at most 80 characters.')

const memberIdsSchema = z.array(z.uuid()).max(100, 'That’s too many people.')

export const createListInputSchema = z
  .strictObject({
    title: listTitleSchema,
    kind: z.enum(LIST_KINDS),
    visibility: listVisibilitySchema,
    memberIds: memberIdsSchema,
  })
  .refine((input) => input.visibility !== 'selected_members' || input.memberIds.length > 0, {
    path: ['memberIds'],
    message: 'Choose at least one person.',
  })
export type CreateListInput = z.infer<typeof createListInputSchema>

export const updateListInputSchema = z
  .strictObject({
    title: listTitleSchema.optional(),
    kind: z.enum(LIST_KINDS).optional(),
    visibility: listVisibilitySchema.optional(),
    memberIds: memberIdsSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Nothing to change.',
  })
export type UpdateListInput = z.infer<typeof updateListInputSchema>

export const listItemTextSchema = z
  .string()
  .trim()
  .min(1, 'Write something.')
  .max(200, 'Use at most 200 characters.')

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .transform((value) => value || null)
    .nullable()

export const createListItemInputSchema = z.strictObject({
  text: listItemTextSchema,
  quantity: optionalText(40).optional(),
  note: optionalText(500).optional(),
  assignedTo: z.uuid().nullable().optional(),
  dueOn: dateSchema.nullable().optional(),
})
export type CreateListItemInput = z.input<typeof createListItemInputSchema>

export const updateListItemInputSchema = z
  .strictObject({
    text: listItemTextSchema.optional(),
    quantity: optionalText(40).optional(),
    note: optionalText(500).optional(),
    assignedTo: z.uuid().nullable().optional(),
    dueOn: dateSchema.nullable().optional(),
    done: z.boolean().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Nothing to change.',
  })
export type UpdateListItemInput = z.input<typeof updateListItemInputSchema>

export const reorderListItemsInputSchema = z.strictObject({
  itemIds: z.array(z.uuid()).max(500),
})

export interface ListSummary {
  id: string
  title: string
  kind: ListKind
  visibility: ListVisibility
  createdBy: string | null
  archived: boolean
  itemCount: number
  doneCount: number
  updatedAt: string
}

export interface ListItem {
  id: string
  text: string
  quantity: string | null
  note: string | null
  assignedTo: string | null
  dueOn: string | null
  doneAt: string | null
  doneBy: string | null
  position: number
  createdBy: string | null
}

export interface ListDetail extends ListSummary {
  /** For 'selected_members' lists: who else can see it. */
  memberIds: string[]
  items: ListItem[]
  /** Add, tick off and edit items. */
  canEditItems: boolean
  /** Rename, archive or delete the list. */
  canManage: boolean
  /** Change who can see it (the creator only). */
  canChangeAudience: boolean
}
