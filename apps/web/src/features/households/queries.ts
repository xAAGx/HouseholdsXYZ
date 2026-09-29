import { unwrap } from '@households/api-client'
import type { CreateHouseholdInput } from '@households/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'

export const householdKeys = {
  all: ['households'] as const,
  mine: () => [...householdKeys.all, 'mine'] as const,
}

export function useMyHouseholds() {
  return useQuery({
    queryKey: householdKeys.mine(),
    queryFn: () => unwrap(api.v1.households.$get()),
    select: (data) => data.households,
  })
}

export function useCreateHousehold() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateHouseholdInput) => unwrap(api.v1.households.$post({ json: input })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: householdKeys.all }),
  })
}
