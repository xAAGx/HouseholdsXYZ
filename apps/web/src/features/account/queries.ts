import { unwrap } from '@households/api-client'
import type { UpdatePhoneInput, UpdateProfileInput } from '@households/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { householdKeys } from '../households/queries'
import { profileKeys } from '../profile/queries'

const accountKeys = {
  details: ['account', 'details'] as const,
  deletion: ['account', 'deletion'] as const,
  factors: ['account', 'mfa-factors'] as const,
}

/** Date of birth and phone: only ever shown to the account owner. */
export function useAccountDetails() {
  return useQuery({
    queryKey: accountKeys.details,
    queryFn: () => unwrap(api.v1.me.details.$get()),
    select: (data) => data.details,
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (json: UpdateProfileInput) => unwrap(api.v1.me.$patch({ json })),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: profileKeys.me }),
        queryClient.invalidateQueries({ queryKey: householdKeys.all }),
      ]),
  })
}

export function useUpdatePhone() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (json: UpdatePhoneInput) => unwrap(api.v1.me.phone.$put({ json })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.details }),
  })
}

/** Households that must be handed over or deleted before the account can go. */
export function useDeletionBlockers() {
  return useQuery({
    queryKey: accountKeys.deletion,
    queryFn: () => unwrap(api.v1.me.deletion.$get()),
    select: (data) => data.blockers,
  })
}

export function useDeleteAccount() {
  return useMutation({ mutationFn: () => unwrap(api.v1.me.$delete()) })
}

/** Downloads everything that's yours as a JSON file. */
export async function downloadMyData(): Promise<void> {
  const data = await unwrap(api.v1.me.export.$get())
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `households-xyz-${data.exportedAt.slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

/** Two-step sign-in factors (authenticator apps), straight from Supabase Auth. */
export function useMfaFactors() {
  return useQuery({
    queryKey: accountKeys.factors,
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) throw error
      return data.totp
    },
  })
}

export function useRefreshMfaFactors() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: accountKeys.factors })
}
