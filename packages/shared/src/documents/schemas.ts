import { z } from 'zod'

import { listVisibilitySchema, type ListVisibility } from '../lists/schemas'

// The document vault. The database (vault migration) is the authority on who
// sees and changes what; files go straight to private storage.

export const DOCUMENT_CATEGORIES = [
  'Identity',
  'Insurance',
  'Medical',
  'School',
  'Home',
  'Vehicle',
  'Finance',
  'Legal',
  'Travel',
  'Pets',
  'Other',
] as const

export const DOCUMENT_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const
export type DocumentFileType = (typeof DOCUMENT_FILE_TYPES)[number]
export const MAX_DOCUMENT_FILE_BYTES = 20 * 1024 * 1024

/** "Day before" choices for expiry reminders. */
export const DOCUMENT_REMIND_OPTIONS = [
  { days: 0, label: 'Only on the day' },
  { days: 7, label: 'A week before' },
  { days: 30, label: 'A month before' },
  { days: 90, label: 'Three months before' },
  { days: 180, label: 'Six months before' },
] as const

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .transform((value) => value || null)
    .nullable()

export const documentInputSchema = z
  .strictObject({
    title: z.string().trim().min(1, 'Name the document.').max(120),
    category: z.string().trim().min(1).max(40),
    reference: optionalText(80).optional(),
    notes: optionalText(2000).optional(),
    /** Whose document it is (doesn't show it to them). */
    people: z
      .array(z.uuid())
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length, 'Choose each person once.'),
    expiresOn: z.iso.date({ error: 'Choose a real date.' }).nullable(),
    remindDays: z.number().int().min(0).max(365),
    visibility: listVisibilitySchema,
    sharedWith: z.array(z.uuid()).max(100),
  })
  .refine((input) => input.visibility !== 'selected_members' || input.sharedWith.length > 0, {
    path: ['sharedWith'],
    message: 'Choose at least one person.',
  })
export type DocumentInput = z.input<typeof documentInputSchema>

export const documentFileInputSchema = z.strictObject({
  storagePath: z.string().max(400),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(DOCUMENT_FILE_TYPES),
  sizeBytes: z.number().int().min(1).max(MAX_DOCUMENT_FILE_BYTES),
})
export type DocumentFileInput = z.input<typeof documentFileInputSchema>

/**
 * A file name safe for a storage path segment: letters, digits, dots, dashes
 * and underscores, starting with a letter or digit, after a unique prefix.
 */
export function storageFileName(prefix: string, name: string): string {
  const safe = name
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/-+/g, '-')
    .slice(-80)
  return `${prefix}-${safe || 'file'}`.slice(0, 128)
}

export interface DocumentFile {
  id: string
  storagePath: string
  fileName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export interface VaultDocument {
  id: string
  title: string
  category: string
  reference: string | null
  notes: string | null
  people: string[]
  expiresOn: string | null
  remindDays: number
  visibility: ListVisibility
  sharedWith: string[]
  createdBy: string | null
  canEdit: boolean
  files: DocumentFile[]
}

export interface VaultView {
  documents: VaultDocument[]
  canAdd: boolean
}
