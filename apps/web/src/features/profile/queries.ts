import { unwrap } from '@households/api-client'
import { useQuery } from '@tanstack/react-query'

import { api } from '../../lib/api'

export const profileKeys = {
  me: ['me'] as const,
}

/** The signed-in user's own profile (never includes date of birth or phone). */
export function useMe() {
  return useQuery({
    queryKey: profileKeys.me,
    queryFn: () => unwrap(api.v1.me.$get()),
    select: (data) => data.profile,
  })
}
