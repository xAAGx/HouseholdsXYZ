import { unwrap } from '@households/api-client'
import type {
  AllowanceInput,
  BillInput,
  BudgetInput,
  ExpenseInput,
  PayBillInput,
  PocketMoneyInput,
  SavingsGoalInput,
  SettlementInput,
} from '@households/shared'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import { liveInterval } from '../live/live-status'

export const moneyKeys = {
  all: (householdId: string) => ['money', householdId] as const,
  month: (householdId: string, month: string) => [...moneyKeys.all(householdId), month] as const,
  pocket: (householdId: string) => ['pocket', householdId] as const,
}

/**
 * Expenses, budgets, bills and balances for a month. People who can't see
 * the household's money (children) get a 404.
 */
export function useMoney(householdId: string, month: string) {
  return useQuery({
    queryKey: moneyKeys.month(householdId, month),
    queryFn: () =>
      unwrap(api.v1.households[':id'].money.$get({ param: { id: householdId }, query: { month } })),
    placeholderData: keepPreviousData,
    refetchInterval: liveInterval(60_000),
  })
}

export function usePocket(householdId: string) {
  return useQuery({
    queryKey: moneyKeys.pocket(householdId),
    queryFn: () => unwrap(api.v1.households[':id'].pocket.$get({ param: { id: householdId } })),
    refetchInterval: liveInterval(60_000),
  })
}

export function useMoneyActions(householdId: string) {
  const queryClient = useQueryClient()
  const settle = () => queryClient.invalidateQueries({ queryKey: moneyKeys.all(householdId) })
  const money = api.v1.households[':id'].money
  const param = { id: householdId }
  return {
    addExpense: useMutation({
      mutationFn: (json: ExpenseInput) => unwrap(money.expenses.$post({ param, json })),
      onSettled: settle,
    }),
    updateExpense: useMutation({
      mutationFn: ({ expenseId, json }: { expenseId: string; json: ExpenseInput }) =>
        unwrap(money.expenses[':expenseId'].$put({ param: { ...param, expenseId }, json })),
      onSettled: settle,
    }),
    deleteExpense: useMutation({
      mutationFn: (expenseId: string) =>
        unwrap(money.expenses[':expenseId'].$delete({ param: { ...param, expenseId } })),
      onSettled: settle,
    }),
    settleUp: useMutation({
      mutationFn: (json: SettlementInput) => unwrap(money.settlements.$post({ param, json })),
      onSettled: settle,
    }),
    deleteSettlement: useMutation({
      mutationFn: (settlementId: string) =>
        unwrap(money.settlements[':settlementId'].$delete({ param: { ...param, settlementId } })),
      onSettled: settle,
    }),
    addBudget: useMutation({
      mutationFn: (json: BudgetInput) => unwrap(money.budgets.$post({ param, json })),
      onSettled: settle,
    }),
    updateBudget: useMutation({
      mutationFn: ({ budgetId, json }: { budgetId: string; json: BudgetInput }) =>
        unwrap(money.budgets[':budgetId'].$put({ param: { ...param, budgetId }, json })),
      onSettled: settle,
    }),
    deleteBudget: useMutation({
      mutationFn: (budgetId: string) =>
        unwrap(money.budgets[':budgetId'].$delete({ param: { ...param, budgetId } })),
      onSettled: settle,
    }),
    addBill: useMutation({
      mutationFn: (json: BillInput) => unwrap(money.bills.$post({ param, json })),
      onSettled: settle,
    }),
    updateBill: useMutation({
      mutationFn: ({ billId, json }: { billId: string; json: BillInput }) =>
        unwrap(money.bills[':billId'].$put({ param: { ...param, billId }, json })),
      onSettled: settle,
    }),
    payBill: useMutation({
      mutationFn: ({ billId, json }: { billId: string; json: PayBillInput }) =>
        unwrap(money.bills[':billId'].pay.$post({ param: { ...param, billId }, json })),
      onSettled: settle,
    }),
    deleteBill: useMutation({
      mutationFn: (billId: string) =>
        unwrap(money.bills[':billId'].$delete({ param: { ...param, billId } })),
      onSettled: settle,
    }),
  }
}

export type MoneyActions = ReturnType<typeof useMoneyActions>

export function usePocketActions(householdId: string) {
  const queryClient = useQueryClient()
  const settle = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: moneyKeys.pocket(householdId) }),
      queryClient.invalidateQueries({ queryKey: ['chores', householdId] }),
    ])
  const pocket = api.v1.households[':id'].pocket
  const param = { id: householdId }
  return {
    addMoney: useMutation({
      mutationFn: (json: PocketMoneyInput) => unwrap(pocket.money.$post({ param, json })),
      onSettled: settle,
    }),
    swapPoints: useMutation({
      mutationFn: (json: { profileId: string; points: number }) =>
        unwrap(pocket.swap.$post({ param, json })),
      onSettled: settle,
    }),
    setAllowance: useMutation({
      mutationFn: ({ profileId, json }: { profileId: string; json: AllowanceInput }) =>
        unwrap(pocket.allowances[':profileId'].$put({ param: { ...param, profileId }, json })),
      onSettled: settle,
    }),
    removeAllowance: useMutation({
      mutationFn: (profileId: string) =>
        unwrap(pocket.allowances[':profileId'].$delete({ param: { ...param, profileId } })),
      onSettled: settle,
    }),
    addGoal: useMutation({
      mutationFn: (json: SavingsGoalInput) => unwrap(pocket.goals.$post({ param, json })),
      onSettled: settle,
    }),
    updateGoal: useMutation({
      mutationFn: ({
        goalId,
        json,
      }: {
        goalId: string
        json: { title?: string; targetMinor?: number; achieved?: boolean }
      }) => unwrap(pocket.goals[':goalId'].$patch({ param: { ...param, goalId }, json })),
      onSettled: settle,
    }),
    deleteGoal: useMutation({
      mutationFn: (goalId: string) =>
        unwrap(pocket.goals[':goalId'].$delete({ param: { ...param, goalId } })),
      onSettled: settle,
    }),
  }
}

export type PocketActions = ReturnType<typeof usePocketActions>
