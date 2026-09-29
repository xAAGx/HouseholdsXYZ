import { ApiError } from '@households/shared'
import { QueryClient } from '@tanstack/react-query'

const NON_RETRYABLE = new Set(['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION_FAILED'])

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) =>
        !(error instanceof ApiError && NON_RETRYABLE.has(error.code)) && failureCount < 2,
    },
  },
})
