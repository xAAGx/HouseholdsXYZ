import { currentStreak, localDate, type ChoreBoard } from '@households/shared'

/** Days in a row this person got a chore done (by this device's calendar). */
export function streakOf(board: ChoreBoard, profileId: string): number {
  const days = board.recent
    .filter(
      (completion) => completion.completedBy === profileId && completion.status !== 'rejected',
    )
    .map((completion) => localDate(new Date(completion.createdAt)))
  return currentStreak(days, board.today)
}
