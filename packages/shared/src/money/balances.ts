// Who owes whom, from shared expenses and settle-ups (Splitwise-style).

export interface SplitExpense {
  amountMinor: number
  paidBy: string | null
  /** Shared equally between these people; empty: not split. */
  splitBetween: string[]
}

export interface Settlement {
  fromId: string | null
  toId: string | null
  amountMinor: number
}

/** Each person's share of an expense: equal, with spare cents to the first people. */
export function splitShares(amountMinor: number, people: string[]): Map<string, number> {
  const shares = new Map<string, number>()
  if (people.length === 0) return shares
  const base = Math.floor(amountMinor / people.length)
  const spare = amountMinor - base * people.length
  people.forEach((person, i) => shares.set(person, base + (i < spare ? 1 : 0)))
  return shares
}

/**
 * Net position per person: positive is owed to them, negative they owe.
 * Paying for something you share counts for you; your share counts against.
 */
export function netBalances(
  expenses: SplitExpense[],
  settlements: Settlement[],
): Map<string, number> {
  const net = new Map<string, number>()
  const add = (person: string | null, amount: number) => {
    if (!person) return
    net.set(person, (net.get(person) ?? 0) + amount)
  }
  for (const expense of expenses) {
    if (expense.splitBetween.length === 0 || !expense.paidBy) continue
    add(expense.paidBy, expense.amountMinor)
    for (const [person, share] of splitShares(expense.amountMinor, expense.splitBetween)) {
      add(person, -share)
    }
  }
  for (const settlement of settlements) {
    add(settlement.fromId, settlement.amountMinor)
    add(settlement.toId, -settlement.amountMinor)
  }
  for (const [person, amount] of net) if (amount === 0) net.delete(person)
  return net
}

export interface Debt {
  fromId: string
  toId: string
  amountMinor: number
}

/** The fewest payments that settle everyone up: biggest debtor pays biggest creditor. */
export function settleUp(net: Map<string, number>): Debt[] {
  const owes = [...net].filter(([, a]) => a < 0).map(([id, a]) => ({ id, left: -a }))
  const owed = [...net].filter(([, a]) => a > 0).map(([id, a]) => ({ id, left: a }))
  owes.sort((a, b) => b.left - a.left || a.id.localeCompare(b.id))
  owed.sort((a, b) => b.left - a.left || a.id.localeCompare(b.id))
  const debts: Debt[] = []
  let i = 0
  let j = 0
  while (i < owes.length && j < owed.length) {
    const debtor = owes[i]!
    const creditor = owed[j]!
    const amount = Math.min(debtor.left, creditor.left)
    if (amount > 0) debts.push({ fromId: debtor.id, toId: creditor.id, amountMinor: amount })
    debtor.left -= amount
    creditor.left -= amount
    if (debtor.left === 0) i++
    if (creditor.left === 0) j++
  }
  return debts
}
