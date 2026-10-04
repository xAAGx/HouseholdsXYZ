import { unwrap } from '@households/api-client'
import type { EventInput } from '@households/shared'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import { liveInterval } from '../live/live-status'

export const calendarKeys = {
  all: (householdId: string) => ['calendar', householdId] as const,
  range: (householdId: string, from: string, to: string) =>
    [...calendarKeys.all(householdId), from, to] as const,
}

/** Events (repeats expanded), due items, chores and meals between two dates. */
export function useCalendar(householdId: string, from: string, to: string) {
  return useQuery({
    queryKey: calendarKeys.range(householdId, from, to),
    queryFn: () =>
      unwrap(
        api.v1.households[':id'].calendar.$get({
          param: { id: householdId },
          query: { from, to },
        }),
      ),
    placeholderData: keepPreviousData,
    refetchInterval: liveInterval(30_000),
  })
}

export function useCalendarActions(householdId: string) {
  const queryClient = useQueryClient()
  const settle = () => queryClient.invalidateQueries({ queryKey: calendarKeys.all(householdId) })
  const param = { id: householdId }
  return {
    create: useMutation({
      mutationFn: (json: EventInput) =>
        unwrap(api.v1.households[':id'].calendar.$post({ param, json })),
      onSettled: settle,
    }),
    update: useMutation({
      mutationFn: ({ eventId, json }: { eventId: string; json: EventInput }) =>
        unwrap(
          api.v1.households[':id'].calendar[':eventId'].$put({
            param: { ...param, eventId },
            json,
          }),
        ),
      onSettled: settle,
    }),
    skip: useMutation({
      mutationFn: ({ eventId, date }: { eventId: string; date: string }) =>
        unwrap(
          api.v1.households[':id'].calendar[':eventId'].skip.$post({
            param: { ...param, eventId },
            json: { date },
          }),
        ),
      onSettled: settle,
    }),
    remove: useMutation({
      mutationFn: (eventId: string) =>
        unwrap(
          api.v1.households[':id'].calendar[':eventId'].$delete({ param: { ...param, eventId } }),
        ),
      onSettled: settle,
    }),
  }
}

export type CalendarActions = ReturnType<typeof useCalendarActions>
