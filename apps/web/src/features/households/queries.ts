import { unwrap } from '@households/api-client'
import type {
  AddChildInput,
  AssignableRole,
  CreateHouseholdInput,
  InviteRole,
  MoveHouseholdInput,
  UpdateHouseholdInput,
} from '@households/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'

/** The raw address segments from the URL, validated by the API. */
export interface AddressParams {
  country: string
  region: string
  city: string
  name: string
}

export const householdKeys = {
  all: ['households'] as const,
  mine: () => [...householdKeys.all, 'mine'] as const,
  view: (address: AddressParams, signedIn: boolean) =>
    [...householdKeys.all, 'view', signedIn, address] as const,
  invites: (householdId: string) => [...householdKeys.all, householdId, 'invites'] as const,
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

/**
 * The household page for whoever is looking: members get the full view,
 * signed-out visitors ask the public endpoint (public households only).
 * Pass `enabled: false` until the session is known, so a signed-in member
 * never makes a pointless signed-out request first.
 */
export function useHouseholdView(address: AddressParams, signedIn: boolean, enabled = true) {
  return useQuery({
    queryKey: householdKeys.view(address, signedIn),
    enabled,
    queryFn: async () => {
      const response = signedIn
        ? await unwrap(api.v1.households['by-address'].$get({ query: address }))
        : await unwrap(api.public.households['by-address'].$get({ query: address }))
      return response.view
    },
  })
}

/** Mutations for one household. Each refreshes every household query afterwards. */
function useHouseholdMutation<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: householdKeys.all }),
  })
}

export function useUpdateHousehold(id: string) {
  return useHouseholdMutation((json: UpdateHouseholdInput) =>
    unwrap(api.v1.households[':id'].$patch({ param: { id }, json })),
  )
}

export function useMoveHousehold(id: string) {
  return useHouseholdMutation((json: MoveHouseholdInput) =>
    unwrap(api.v1.households[':id'].address.$put({ param: { id }, json })),
  )
}

export function useDeleteHousehold(id: string) {
  return useHouseholdMutation(() => unwrap(api.v1.households[':id'].$delete({ param: { id } })))
}

export function useLeaveHousehold(id: string) {
  return useHouseholdMutation(() =>
    unwrap(api.v1.households[':id'].membership.$delete({ param: { id } })),
  )
}

export function useTransferOwnership(id: string) {
  return useHouseholdMutation((profileId: string) =>
    unwrap(api.v1.households[':id'].owner.$post({ param: { id }, json: { profileId } })),
  )
}

export function useSetMemberRole(id: string) {
  return useHouseholdMutation(({ profileId, role }: { profileId: string; role: AssignableRole }) =>
    unwrap(
      api.v1.households[':id'].members[':profileId'].$patch({
        param: { id, profileId },
        json: { role },
      }),
    ),
  )
}

export function useRemoveMember(id: string) {
  return useHouseholdMutation((profileId: string) =>
    unwrap(api.v1.households[':id'].members[':profileId'].$delete({ param: { id, profileId } })),
  )
}

// ── Invite links ────────────────────────────────────────────────────────────

export function useInvites(id: string, enabled: boolean) {
  return useQuery({
    queryKey: householdKeys.invites(id),
    enabled,
    queryFn: () => unwrap(api.v1.households[':id'].invites.$get({ param: { id } })),
    select: (data) => data.invites,
  })
}

export function useCreateInvite(id: string) {
  return useHouseholdMutation((role: InviteRole) =>
    unwrap(api.v1.households[':id'].invites.$post({ param: { id }, json: { role } })),
  )
}

export function useRevokeInvite(id: string) {
  return useHouseholdMutation((inviteId: string) =>
    unwrap(api.v1.households[':id'].invites[':inviteId'].$delete({ param: { id, inviteId } })),
  )
}

// ── Child accounts ──────────────────────────────────────────────────────────

export function useAddChild(id: string) {
  return useHouseholdMutation((json: AddChildInput) =>
    unwrap(api.v1.households[':id'].children.$post({ param: { id }, json })),
  )
}

export function useChildSignInCode(id: string) {
  // Not a household change, so nothing to refresh.
  return useMutation({
    mutationFn: (childId: string) =>
      unwrap(
        api.v1.households[':id'].children[':childId']['sign-in-code'].$post({
          param: { id, childId },
        }),
      ),
  })
}

export function useRemoveChild(id: string) {
  return useHouseholdMutation((childId: string) =>
    unwrap(api.v1.households[':id'].children[':childId'].$delete({ param: { id, childId } })),
  )
}
