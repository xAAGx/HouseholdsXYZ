import { unwrap } from '@households/api-client'
import {
  localDate,
  type AdjustPointsInput,
  type CreateChoreInput,
  type CreateRewardInput,
  type UpdateChoreInput,
  type UpdateRewardInput,
} from '@households/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import { liveInterval } from '../live/live-status'

export const choreKeys = {
  board: (householdId: string) => ['chores', householdId] as const,
}

/** The chores page for today (this device's date), refreshed while open. */
export function useChoreBoard(householdId: string) {
  return useQuery({
    queryKey: choreKeys.board(householdId),
    queryFn: () =>
      unwrap(
        api.v1.households[':id'].chores.$get({
          param: { id: householdId },
          query: { today: localDate() },
        }),
      ),
    select: (data) => data.board,
    refetchInterval: liveInterval(15_000),
  })
}

function useChoresMutation<TInput, TResult>(
  householdId: string,
  fn: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: choreKeys.board(householdId) }),
  })
}

export function useChoreActions(householdId: string) {
  const id = householdId
  const h = api.v1.households[':id']
  return {
    createChore: useChoresMutation(id, (json: CreateChoreInput) =>
      unwrap(h.chores.$post({ param: { id }, json })),
    ),
    updateChore: useChoresMutation(
      id,
      ({ choreId, ...json }: UpdateChoreInput & { choreId: string }) =>
        unwrap(h.chores[':choreId'].$patch({ param: { id, choreId }, json })),
    ),
    deleteChore: useChoresMutation(id, (choreId: string) =>
      unwrap(h.chores[':choreId'].$delete({ param: { id, choreId } })),
    ),
    /** Sends whoever's turn it is a reminder now. */
    nudge: useMutation({
      mutationFn: (choreId: string) =>
        unwrap(h.chores[':choreId'].nudge.$post({ param: { id, choreId } })),
    }),
    complete: useChoresMutation(id, (choreId: string) =>
      unwrap(
        h.chores[':choreId'].complete.$post({
          param: { id, choreId },
          json: { today: localDate() },
        }),
      ),
    ),
    review: useChoresMutation(
      id,
      ({
        completionId,
        approve,
        note,
      }: {
        completionId: string
        approve: boolean
        note?: string
      }) =>
        unwrap(
          h.completions[':completionId'].review.$post({
            param: { id, completionId },
            json: { approve, ...(note ? { note } : {}) },
          }),
        ),
    ),
    undo: useChoresMutation(id, (completionId: string) =>
      unwrap(h.completions[':completionId'].$delete({ param: { id, completionId } })),
    ),
    createReward: useChoresMutation(id, (json: CreateRewardInput) =>
      unwrap(h.rewards.$post({ param: { id }, json })),
    ),
    updateReward: useChoresMutation(
      id,
      ({ rewardId, ...json }: UpdateRewardInput & { rewardId: string }) =>
        unwrap(h.rewards[':rewardId'].$patch({ param: { id, rewardId }, json })),
    ),
    redeem: useChoresMutation(id, (rewardId: string) =>
      unwrap(h.rewards[':rewardId'].redeem.$post({ param: { id, rewardId } })),
    ),
    reviewRedemption: useChoresMutation(
      id,
      ({ redemptionId, approve }: { redemptionId: string; approve: boolean }) =>
        unwrap(
          h.redemptions[':redemptionId'].review.$post({
            param: { id, redemptionId },
            json: { approve },
          }),
        ),
    ),
    cancelRedemption: useChoresMutation(id, (redemptionId: string) =>
      unwrap(h.redemptions[':redemptionId'].$delete({ param: { id, redemptionId } })),
    ),
    adjustPoints: useChoresMutation(id, (json: AdjustPointsInput) =>
      unwrap(h.points.$post({ param: { id }, json })),
    ),
  }
}

export type ChoreActions = ReturnType<typeof useChoreActions>
