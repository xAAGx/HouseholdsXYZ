import { unwrap } from '@households/api-client'
import type { PushSubscriptionJson } from '@households/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import { liveInterval } from '../live/live-status'

export const notificationKeys = {
  all: ['notifications'] as const,
  inbox: () => [...notificationKeys.all, 'inbox'] as const,
  pushConfig: () => [...notificationKeys.all, 'push-config'] as const,
  device: (endpoint: string | null) => [...notificationKeys.all, 'device', endpoint] as const,
}

/** My latest notifications and how many are unread. */
export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.inbox(),
    enabled,
    queryFn: () => unwrap(api.v1.notifications.$get()),
    refetchInterval: liveInterval(60_000),
  })
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids?: string[]) =>
      unwrap(api.v1.notifications.read.$post({ json: ids ? { ids } : {} })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.inbox() }),
  })
}

/** Whether this server sends push notifications (and its public key). */
export function usePushConfig() {
  return useQuery({
    queryKey: notificationKeys.pushConfig(),
    queryFn: () => unwrap(api.v1.me.push.$get()),
    staleTime: Infinity,
  })
}

/** Whether this device's push subscription is registered with us. */
export function usePushDevice(endpoint: string | null) {
  return useQuery({
    queryKey: notificationKeys.device(endpoint),
    enabled: endpoint !== null,
    queryFn: () => unwrap(api.v1.me.push.status.$post({ json: { endpoint: endpoint ?? '' } })),
  })
}

export function useSavePushDevice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (json: { subscription: PushSubscriptionJson; showDetails: boolean }) =>
      unwrap(api.v1.me.push.$put({ json })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}

export function useUpdatePushDevice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (json: { endpoint: string; showDetails: boolean }) =>
      unwrap(api.v1.me.push.$patch({ json })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}
