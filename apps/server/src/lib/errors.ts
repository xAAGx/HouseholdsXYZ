import { API_ERROR_STATUS, ApiError, type ApiErrorCode } from '@households/shared'
import type { PostgrestError } from '@supabase/supabase-js'
import type { ErrorHandler, NotFoundHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'

import type { AppEnv } from '../types'
import type { Logger } from './logger'

function codeForStatus(status: number): ApiErrorCode {
  const match = (Object.entries(API_ERROR_STATUS) as [ApiErrorCode, number][]).find(
    ([, s]) => s === status,
  )
  if (match) return match[0]
  return status >= 500 ? 'INTERNAL' : 'BAD_REQUEST'
}

/**
 * Maps a database error to a client-safe ApiError. Raw database messages can
 * reveal schema details, so they are never forwarded; the original error is
 * attached as `cause` and logged server-side for 5xx responses.
 */
export function toApiError(error: PostgrestError): ApiError {
  switch (error.code) {
    case '42501': // insufficient_privilege (RLS / grants / our RPC checks)
      return new ApiError('FORBIDDEN', undefined, undefined, { cause: error })
    case '23505': // unique_violation
      return new ApiError('CONFLICT', undefined, undefined, { cause: error })
    case '23001': // restrict_violation (e.g. deleting a reward someone asked for)
      return new ApiError('CONFLICT', 'This is still in use. Archive it instead.', undefined, {
        cause: error,
      })
    case '22023': // invalid_parameter_value (our RPCs' input checks)
      return new ApiError('VALIDATION_FAILED', 'Some values aren’t allowed.', undefined, {
        cause: error,
      })
    case '23514': // check_violation (includes reserved slugs)
      return new ApiError('VALIDATION_FAILED', 'Some values aren’t allowed.', undefined, {
        cause: error,
      })
    case '54000': // program_limit_exceeded (our abuse caps)
      return new ApiError('CONFLICT', 'You’ve reached the limit for this.', undefined, {
        cause: error,
      })
    case 'P0002': // no_data_found (e.g. an invite link that's used up or expired)
    case 'PGRST116': // .single() found no row, or a row RLS hides
      return new ApiError('NOT_FOUND', undefined, undefined, { cause: error })
    default:
      return new ApiError('INTERNAL', undefined, undefined, { cause: error })
  }
}

export function createErrorHandler(logger: Logger): ErrorHandler<AppEnv> {
  return (err, c) => {
    const requestId = c.get('requestId')

    if (err instanceof ApiError) {
      if (err.status >= 500) {
        logger.error('request failed', { requestId, error: err, cause: err.cause })
      }
      return c.json(err.toBody(requestId), err.status)
    }

    if (err instanceof HTTPException) {
      // Raised by Hono itself (e.g. malformed JSON). Keep the status, drop the details.
      const apiError = new ApiError(codeForStatus(err.status))
      return c.json(apiError.toBody(requestId), apiError.status)
    }

    logger.error('unhandled error', { requestId, error: err })
    return c.json(new ApiError('INTERNAL').toBody(requestId), 500)
  }
}

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) =>
  c.json(new ApiError('NOT_FOUND').toBody(c.get('requestId')), 404)
