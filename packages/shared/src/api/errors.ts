/**
 * The one error shape every API response uses. Messages are safe to show to
 * users: they never contain stack traces, SQL, or other people's data.
 */

export const API_ERROR_STATUS = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const

export type ApiErrorCode = keyof typeof API_ERROR_STATUS
export type ApiErrorStatus = (typeof API_ERROR_STATUS)[ApiErrorCode]

const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  BAD_REQUEST: 'The request was malformed.',
  VALIDATION_FAILED: 'Some fields need attention.',
  UNAUTHENTICATED: 'Please sign in to continue.',
  FORBIDDEN: 'You don’t have access to this.',
  // Deliberately identical for "doesn't exist" and "exists but you can't see it",
  // so private households can't be discovered by probing.
  NOT_FOUND: 'We couldn’t find that.',
  CONFLICT: 'That conflicts with something that already exists.',
  PAYLOAD_TOO_LARGE: 'That request is too large.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  INTERNAL: 'Something went wrong on our side. Please try again.',
}

export interface ValidationIssue {
  /** Dotted path to the field, e.g. "slug" or "members.0.role". */
  path: string
  message: string
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode
    message: string
    requestId?: string
    issues?: ValidationIssue[]
  }
}

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: ApiErrorStatus
  readonly issues: ValidationIssue[] | undefined

  /**
   * @param message Shown to the user, so it must be safe and generic. Put internal
   *   details in `options.cause`: that's logged on the server, never sent.
   */
  constructor(
    code: ApiErrorCode,
    message?: string,
    issues?: ValidationIssue[],
    options?: { cause?: unknown },
  ) {
    super(message ?? DEFAULT_MESSAGES[code], options)
    this.name = 'ApiError'
    this.code = code
    this.status = API_ERROR_STATUS[code]
    this.issues = issues
  }

  toBody(requestId?: string): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(requestId ? { requestId } : {}),
        ...(this.issues ? { issues: this.issues } : {}),
      },
    }
  }
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== 'object' || !('error' in value)) return false
  const { error } = value
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code in API_ERROR_STATUS &&
    'message' in error &&
    typeof error.message === 'string'
  )
}
