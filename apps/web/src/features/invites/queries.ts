import { unwrap } from '@households/api-client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import { householdKeys } from '../households/queries'

// Tokens go in POST bodies, never in URLs (they would end up in logs).

export function useInvitePreview(token: string | null) {
  return useQuery({
    queryKey: ['invites', 'preview', token],
    enabled: token !== null,
    retry: false,
    queryFn: () => unwrap(api.v1.invites.preview.$post({ json: { token: token ?? '' } })),
    select: (data) => data.invite,
  })
}

export function useAcceptInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (token: string) => unwrap(api.v1.invites.accept.$post({ json: { token } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: householdKeys.all }),
  })
}
