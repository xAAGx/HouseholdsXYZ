import { ApiError } from '@households/shared'

/** A message that's safe to show: the API's own (always user-safe), or a generic one. */
export function apiErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'
}
