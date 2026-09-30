import { z } from 'zod'

/**
 * Password rules. Supabase Auth enforces the same rules (supabase/config.toml
 * and the hosted project's Auth settings must match). Kept apart from the
 * other account schemas so screens that only show a password field don't pull
 * in the phone-number library.
 */

export const PASSWORD_MIN_LENGTH = 12
/** bcrypt, which Supabase Auth uses, ignores everything after 72 bytes. */
export const PASSWORD_MAX_BYTES = 72

/** Each requirement, for a live checklist next to the password field. */
export const PASSWORD_REQUIREMENTS = [
  {
    id: 'length',
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (p: string) => [...p].length >= PASSWORD_MIN_LENGTH,
  },
  { id: 'lower', label: 'A lowercase letter', test: (p: string) => /\p{Ll}/u.test(p) },
  { id: 'upper', label: 'An uppercase letter', test: (p: string) => /\p{Lu}/u.test(p) },
  { id: 'digit', label: 'A number', test: (p: string) => /\d/.test(p) },
  {
    id: 'symbol',
    label: 'A symbol, like ! or #',
    test: (p: string) => /[^\p{L}\p{N}\s]/u.test(p),
  },
] as const

/** A new password (sign-up, reset). Existing passwords are only checked by Supabase. */
export const newPasswordSchema = z
  .string()
  .refine(
    (p) => new TextEncoder().encode(p).length <= PASSWORD_MAX_BYTES,
    'That password is too long.',
  )
  .superRefine((password, ctx) => {
    const missing = PASSWORD_REQUIREMENTS.filter((r) => !r.test(password))
    if (missing.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: `Your password needs: ${missing.map((r) => r.label.toLowerCase()).join(', ')}.`,
      })
    }
  })
