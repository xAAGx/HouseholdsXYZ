import { z } from 'zod'

/**
 * Children sign in with a one-time code a parent shows them, like K7P4-MX2Q.
 * The database makes the codes (public.create_child_sign_in_code); this is
 * the same format for forms and the API. A test keeps the alphabet in sync.
 * No I, O, 0 or 1, which are easy to confuse.
 */
export const CHILD_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CHILD_CODE_LENGTH = 8
export const CHILD_CODE_TTL_MINUTES = 10

/** Uppercases and drops spaces and dashes: "k7p4 mx2q" → "K7P4MX2Q". */
export function normalizeChildCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '')
}

/** "K7P4MX2Q" → "K7P4-MX2Q", easier to read out and type. */
export function formatChildCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

const CODE_PATTERN = new RegExp(`^[${CHILD_CODE_ALPHABET}]{${CHILD_CODE_LENGTH}}$`)

export const childSignInCodeSchema = z
  .string()
  .max(32, 'Enter the 8-character code from your parent.')
  .transform(normalizeChildCode)
  .pipe(z.string().regex(CODE_PATTERN, 'Enter the 8-character code from your parent.'))

export const childSignInInputSchema = z.strictObject({ code: childSignInCodeSchema })

export const addChildInputSchema = z.strictObject({
  displayName: z
    .string()
    .trim()
    .min(1, 'Enter your child’s name.')
    .max(50, 'Use at most 50 characters.'),
})
export type AddChildInput = z.infer<typeof addChildInputSchema>
