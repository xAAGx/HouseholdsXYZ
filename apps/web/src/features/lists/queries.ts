import { unwrap } from '@households/api-client'
import type {
  CreateListInput,
  CreateListItemInput,
  ListDetail,
  UpdateListInput,
  UpdateListItemInput,
} from '@households/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import { liveInterval } from '../live/live-status'

/** How often an open list checks for other people's changes (without live updates). */
const LIVE_INTERVAL_MS = liveInterval(10_000)

export const listKeys = {
  all: (householdId: string) => ['lists', householdId] as const,
  assigned: (householdId: string) => [...listKeys.all(householdId), 'assigned'] as const,
  index: (householdId: string, archived: boolean) =>
    [...listKeys.all(householdId), 'index', archived] as const,
  detail: (householdId: string, listId: string) =>
    [...listKeys.all(householdId), 'detail', listId] as const,
}

export function useLists(householdId: string, archived: boolean) {
  return useQuery({
    queryKey: listKeys.index(householdId, archived),
    queryFn: () =>
      unwrap(
        api.v1.households[':id'].lists.$get({
          param: { id: householdId },
          query: { archived: archived ? 'true' : 'false' },
        }),
      ),
    select: (data) => data.lists,
    refetchInterval: LIVE_INTERVAL_MS,
  })
}

/** Open items assigned to me, across every list I can see. */
export function useAssignedItems(householdId: string) {
  return useQuery({
    queryKey: listKeys.assigned(householdId),
    queryFn: () =>
      unwrap(api.v1.households[':id'].lists.assigned.$get({ param: { id: householdId } })),
    select: (data) => data.items,
    refetchInterval: LIVE_INTERVAL_MS,
  })
}

export function useList(householdId: string, listId: string) {
  return useQuery({
    queryKey: listKeys.detail(householdId, listId),
    queryFn: () =>
      unwrap(
        api.v1.households[':id'].lists[':listId'].$get({ param: { id: householdId, listId } }),
      ),
    select: (data) => data.list,
    refetchInterval: LIVE_INTERVAL_MS,
  })
}

function useListsMutation<TInput, TResult>(
  householdId: string,
  fn: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKeys.all(householdId) }),
  })
}

export function useCreateList(householdId: string) {
  return useListsMutation(householdId, (json: CreateListInput) =>
    unwrap(api.v1.households[':id'].lists.$post({ param: { id: householdId }, json })),
  )
}

export function useUpdateList(householdId: string, listId: string) {
  return useListsMutation(householdId, (json: UpdateListInput) =>
    unwrap(
      api.v1.households[':id'].lists[':listId'].$patch({
        param: { id: householdId, listId },
        json,
      }),
    ),
  )
}

export function useDeleteList(householdId: string, listId: string) {
  return useListsMutation(householdId, () =>
    unwrap(
      api.v1.households[':id'].lists[':listId'].$delete({ param: { id: householdId, listId } }),
    ),
  )
}

export function useAddItem(householdId: string, listId: string) {
  return useListsMutation(householdId, (json: CreateListItemInput) =>
    unwrap(
      api.v1.households[':id'].lists[':listId'].items.$post({
        param: { id: householdId, listId },
        json,
      }),
    ),
  )
}

/**
 * Edits an item. Ticking off shows immediately (optimistic); if the server
 * says no, the list snaps back when it's refetched.
 */
export function useUpdateItem(householdId: string, listId: string) {
  const queryClient = useQueryClient()
  const key = listKeys.detail(householdId, listId)
  return useMutation({
    mutationFn: ({ itemId, ...json }: UpdateListItemInput & { itemId: string }) =>
      unwrap(
        api.v1.households[':id'].lists[':listId'].items[':itemId'].$patch({
          param: { id: householdId, listId, itemId },
          json,
        }),
      ),
    onMutate: async ({ itemId, done }) => {
      if (done === undefined) return
      await queryClient.cancelQueries({ queryKey: key })
      queryClient.setQueryData<{ list: ListDetail }>(key, (data) =>
        data
          ? {
              list: {
                ...data.list,
                items: data.list.items.map((item) =>
                  item.id === itemId
                    ? { ...item, doneAt: done ? new Date().toISOString() : null }
                    : item,
                ),
              },
            }
          : data,
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKeys.all(householdId) }),
  })
}

export function useDeleteItem(householdId: string, listId: string) {
  return useListsMutation(householdId, (itemId: string) =>
    unwrap(
      api.v1.households[':id'].lists[':listId'].items[':itemId'].$delete({
        param: { id: householdId, listId, itemId },
      }),
    ),
  )
}

/** Several items at once, e.g. pasted one per line. */
export function useAddItems(householdId: string, listId: string) {
  return useListsMutation(householdId, (texts: string[]) =>
    unwrap(
      api.v1.households[':id'].lists[':listId'].items.bulk.$post({
        param: { id: householdId, listId },
        json: { texts },
      }),
    ),
  )
}

/** Unticks everything, to use the list again. */
export function useResetList(householdId: string, listId: string) {
  return useListsMutation(householdId, () =>
    unwrap(
      api.v1.households[':id'].lists[':listId'].items.reset.$post({
        param: { id: householdId, listId },
      }),
    ),
  )
}

export function useDuplicateList(householdId: string, listId: string) {
  return useListsMutation(householdId, (title: string) =>
    unwrap(
      api.v1.households[':id'].lists[':listId'].duplicate.$post({
        param: { id: householdId, listId },
        json: { title },
      }),
    ),
  )
}

/** Ticks an item on any list (for the "for you" view, where the list varies). */
export function useToggleAnyItem(householdId: string) {
  return useListsMutation(
    householdId,
    ({ listId, itemId, done }: { listId: string; itemId: string; done: boolean }) =>
      unwrap(
        api.v1.households[':id'].lists[':listId'].items[':itemId'].$patch({
          param: { id: householdId, listId, itemId },
          json: { done },
        }),
      ),
  )
}

export function useClearDone(householdId: string, listId: string) {
  return useListsMutation(householdId, () =>
    unwrap(
      api.v1.households[':id'].lists[':listId'].items['clear-done'].$post({
        param: { id: householdId, listId },
      }),
    ),
  )
}

export function useReorderItems(householdId: string, listId: string) {
  return useListsMutation(householdId, (itemIds: string[]) =>
    unwrap(
      api.v1.households[':id'].lists[':listId'].items.order.$put({
        param: { id: householdId, listId },
        json: { itemIds },
      }),
    ),
  )
}
