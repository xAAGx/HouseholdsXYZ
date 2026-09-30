import { describe, expect, it } from 'vitest'

import {
  adjustPointsInputSchema,
  createChoreInputSchema,
  createRewardInputSchema,
} from '../chores/schemas'
import {
  createListInputSchema,
  createListItemInputSchema,
  updateListItemInputSchema,
} from './schemas'

const id = '6c1f7f55-4b8a-4d8e-9d0a-2f8a8c3f2b11'

describe('lists', () => {
  it('need someone to share with when shared with selected members', () => {
    const base = { title: 'Gifts', kind: 'todo', memberIds: [] } as const
    expect(
      createListInputSchema.safeParse({ ...base, visibility: 'selected_members' }).success,
    ).toBe(false)
    expect(
      createListInputSchema.safeParse({ ...base, visibility: 'selected_members', memberIds: [id] })
        .success,
    ).toBe(true)
  })

  it('never reach beyond the household', () => {
    const result = createListInputSchema.safeParse({
      title: 'Open',
      kind: 'todo',
      visibility: 'public',
      memberIds: [],
    })
    expect(result.success).toBe(false)
  })

  it('treat empty optional item fields as cleared', () => {
    expect(createListItemInputSchema.parse({ text: ' Milk ', quantity: '  ' })).toEqual({
      text: 'Milk',
      quantity: null,
    })
  })

  it('refuse empty updates', () => {
    expect(updateListItemInputSchema.safeParse({}).success).toBe(false)
    expect(updateListItemInputSchema.safeParse({ done: true }).success).toBe(true)
  })
})

describe('chores', () => {
  const chore = {
    title: 'Feed the cat',
    points: 10,
    assignedTo: null,
    repeat: 'daily',
    needsApproval: true,
  } as const

  it('keep points whole and within range', () => {
    expect(createChoreInputSchema.safeParse(chore).success).toBe(true)
    expect(createChoreInputSchema.safeParse({ ...chore, points: 1.5 }).success).toBe(false)
    expect(createChoreInputSchema.safeParse({ ...chore, points: -1 }).success).toBe(false)
    expect(createChoreInputSchema.safeParse({ ...chore, points: 1001 }).success).toBe(false)
  })

  it('make rewards cost something', () => {
    expect(createRewardInputSchema.safeParse({ title: 'Ice cream', cost: 0 }).success).toBe(false)
    expect(createRewardInputSchema.safeParse({ title: 'Ice cream', cost: 20 }).success).toBe(true)
  })

  it('need a reason and a non-zero amount to adjust points', () => {
    expect(adjustPointsInputSchema.safeParse({ profileId: id, delta: 0, note: 'x' }).success).toBe(
      false,
    )
    expect(adjustPointsInputSchema.safeParse({ profileId: id, delta: 5, note: ' ' }).success).toBe(
      false,
    )
    expect(
      adjustPointsInputSchema.safeParse({ profileId: id, delta: -5, note: 'Broke a rule' }).success,
    ).toBe(true)
  })
})
