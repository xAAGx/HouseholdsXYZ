import { z } from 'zod'

import { normalizePhone } from '../auth/phone'
import { personNameSchema } from '../auth/schemas'
import { cityIdSchema, countryCodeSchema } from '../geo/places'

// Account settings. Email, password and two-step sign-in go straight to
// Supabase Auth from the app; these cover what the API stores.

export const updateProfileInputSchema = z.strictObject({
  firstName: personNameSchema('first'),
  lastName: personNameSchema('last'),
  cityId: cityIdSchema,
})
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>

export const updatePhoneInputSchema = z
  .strictObject({
    countryCode: countryCodeSchema,
    phone: z.string().trim().min(1, 'Enter your phone number.'),
  })
  .transform((input, ctx) => {
    const phone = normalizePhone(input.phone, input.countryCode)
    if (!phone) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Enter a valid phone number.' })
      return z.NEVER
    }
    return { phone }
  })
export type UpdatePhoneInput = z.input<typeof updatePhoneInputSchema>

export const transferOwnershipInputSchema = z.strictObject({ profileId: z.uuid() })

/** Only you can see these (and only after two-step sign-in, if it's on). */
export interface AccountDetails {
  dateOfBirth: string
  phone: string
  phoneVerified: boolean
}

/** A household you own that still has other people in it. */
export interface DeletionBlocker {
  householdId: string
  householdName: string
  otherMembers: number
}
