import { z } from 'zod'

import { cityIdSchema, countryCodeSchema } from '../geo/places'
import { newPasswordSchema } from './password'
import { normalizePhone } from './phone'

/**
 * Account rules shared by the web app, the API and (later) mobile. The
 * database enforces the same age and phone rules in private.handle_new_user().
 * Password rules are in ./password, phone parsing in ./phone.
 */

/** Adults only. Teens and children are added by a parent inside a household. */
export const MIN_ACCOUNT_AGE = 18

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'That email address is too long.')
  .pipe(z.email('Enter a valid email address.'))

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name.')
  .max(80, 'Use at most 80 characters.')

export const personNameSchema = (label: 'first' | 'last') =>
  z.string().trim().min(1, `Enter your ${label} name.`).max(50, 'Use at most 50 characters.')

/** Whole years between a YYYY-MM-DD birth date and `today`. */
export function ageOn(dateOfBirth: string, today: Date = new Date()): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number) as [number, number, number]
  let age = today.getUTCFullYear() - y
  const beforeBirthday =
    today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d)
  if (beforeBirthday) age -= 1
  return age
}

export const dateOfBirthSchema = z
  .string({ error: 'Enter your date of birth.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
  }, 'Enter a real date.')
  .refine((value) => value > '1900-01-01', 'Enter a real date.')
  .refine(
    (value) => ageOn(value) >= MIN_ACCOUNT_AGE,
    `You need to be ${MIN_ACCOUNT_AGE} or older to create an account. A parent can add you to their household.`,
  )

export const signUpInputSchema = z
  .strictObject({
    firstName: personNameSchema('first'),
    lastName: personNameSchema('last'),
    email: emailSchema,
    password: newPasswordSchema,
    dateOfBirth: dateOfBirthSchema,
    countryCode: countryCodeSchema,
    cityId: cityIdSchema,
    phone: z.string().trim().min(1, 'Enter your phone number.'),
    acceptTerms: z.literal(true, { error: 'Please accept the Terms and Privacy Policy.' }),
  })
  .transform((input, ctx) => {
    const phone = normalizePhone(input.phone, input.countryCode)
    if (!phone) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Enter a valid phone number.' })
      return z.NEVER
    }
    return { ...input, phone }
  })
export type SignUpInput = z.input<typeof signUpInputSchema>
export type SignUpData = z.output<typeof signUpInputSchema>

export const signInInputSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
})

export const resetPasswordInputSchema = z
  .strictObject({ password: newPasswordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The passwords don’t match.',
  })

/**
 * The sign-up metadata sent to Supabase Auth. private.handle_new_user() reads
 * it, re-validates it, stores it, and strips date of birth, phone and city
 * from the auth record so they never travel inside access tokens.
 */
export function signUpMetadata(data: SignUpData) {
  return {
    first_name: data.firstName,
    last_name: data.lastName,
    date_of_birth: data.dateOfBirth,
    phone: data.phone,
    city_id: data.cityId,
  }
}
