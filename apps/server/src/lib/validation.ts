import { ApiError } from '@households/shared'

interface ValidationResult {
  success: boolean
  error?: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }
}

/**
 * Hook for `zValidator(target, schema, validationHook)`. Turns schema failures
 * into our standard 422 error. Echoes field paths and messages, never the
 * submitted values.
 */
export function validationHook(result: ValidationResult): void {
  if (result.success) return
  throw new ApiError(
    'VALIDATION_FAILED',
    undefined,
    result.error?.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  )
}
