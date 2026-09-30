import type { AuthError } from '@supabase/supabase-js'

export type AuthErrorField = 'email' | 'password' | 'form'

/**
 * Turns a Supabase Auth error into a message people can act on. Messages
 * never confirm whether an email has an account (sign-up and password reset
 * look the same either way).
 */
export function describeAuthError(error: AuthError): { field: AuthErrorField; message: string } {
  switch (error.code) {
    case 'invalid_credentials':
      return {
        field: 'form',
        message: 'That email and password don’t match. Check them and try again.',
      }
    case 'email_not_confirmed':
      return {
        field: 'form',
        message: 'Confirm your email address first: open the link we sent when you signed up.',
      }
    case 'weak_password':
      return {
        field: 'password',
        message:
          'That password is too easy to guess or has appeared in a data breach. Choose another.',
      }
    case 'same_password':
      return {
        field: 'password',
        message: 'Choose a password you haven’t used for this account before.',
      }
    case 'email_address_invalid':
      return { field: 'email', message: 'Enter a valid email address.' }
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return {
        field: 'form',
        message: 'Too many attempts. Please wait a few minutes and try again.',
      }
    case 'signup_disabled':
      return {
        field: 'form',
        message: 'New accounts can’t be created right now. Please try again later.',
      }
    default:
      return {
        field: 'form',
        message: 'We couldn’t complete that. Check your details and try again in a moment.',
      }
  }
}
