import { z } from 'zod'

/** Must match `auth.email.otp_length` in supabase/config.toml and the hosted project. */
export const EMAIL_OTP_LENGTH = 8

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'That email address is too long.')
  .pipe(z.email('Enter a valid email address.'))

export const emailOtpSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${EMAIL_OTP_LENGTH}}$`), `Enter the ${EMAIL_OTP_LENGTH}-digit code.`)

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name.')
  .max(80, 'Use at most 80 characters.')
