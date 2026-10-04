import { unwrap } from '@households/api-client'
import type {
  CopyMealWeekInput,
  CreateMealInput,
  CreateRecipeInput,
  MealShoppingInput,
  MealShoppingPreviewInput,
  UpdateMealInput,
  UpdateRecipeInput,
} from '@households/shared'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import { calendarKeys } from '../calendar/queries'
import { listKeys } from '../lists/queries'
import { liveInterval } from '../live/live-status'

export const mealKeys = {
  all: (householdId: string) => ['meals', householdId] as const,
  range: (householdId: string, from: string, to: string) =>
    [...mealKeys.all(householdId), from, to] as const,
}

/** The plan between two dates, and the recipe box. */
export function useMealPlan(householdId: string, from: string, to: string) {
  return useQuery({
    queryKey: mealKeys.range(householdId, from, to),
    queryFn: () =>
      unwrap(
        api.v1.households[':id'].meals.$get({ param: { id: householdId }, query: { from, to } }),
      ),
    placeholderData: keepPreviousData,
    refetchInterval: liveInterval(30_000),
  })
}

export function useMealActions(householdId: string) {
  const queryClient = useQueryClient()
  const settle = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: mealKeys.all(householdId) }),
      queryClient.invalidateQueries({ queryKey: calendarKeys.all(householdId) }),
    ])
  const meals = api.v1.households[':id'].meals
  const param = { id: householdId }
  return {
    addMeal: useMutation({
      mutationFn: (json: CreateMealInput) => unwrap(meals.entries.$post({ param, json })),
      onSettled: settle,
    }),
    updateMeal: useMutation({
      mutationFn: ({ entryId, json }: { entryId: string; json: UpdateMealInput }) =>
        unwrap(meals.entries[':entryId'].$patch({ param: { ...param, entryId }, json })),
      onSettled: settle,
    }),
    removeMeal: useMutation({
      mutationFn: (entryId: string) =>
        unwrap(meals.entries[':entryId'].$delete({ param: { ...param, entryId } })),
      onSettled: settle,
    }),
    addRecipe: useMutation({
      mutationFn: (json: CreateRecipeInput) => unwrap(meals.recipes.$post({ param, json })),
      onSettled: settle,
    }),
    updateRecipe: useMutation({
      mutationFn: ({ recipeId, json }: { recipeId: string; json: UpdateRecipeInput }) =>
        unwrap(meals.recipes[':recipeId'].$patch({ param: { ...param, recipeId }, json })),
      onSettled: settle,
    }),
    deleteRecipe: useMutation({
      mutationFn: (recipeId: string) =>
        unwrap(meals.recipes[':recipeId'].$delete({ param: { ...param, recipeId } })),
      onSettled: settle,
    }),
    copyWeek: useMutation({
      mutationFn: (json: CopyMealWeekInput) => unwrap(meals['copy-week'].$post({ param, json })),
      onSettled: settle,
    }),
    importRecipe: useMutation({
      mutationFn: (url: string) => unwrap(meals.recipes.import.$post({ param, json: { url } })),
    }),
    previewShopping: useMutation({
      mutationFn: (json: MealShoppingPreviewInput) =>
        unwrap(meals.shopping.preview.$post({ param, json })),
    }),
    shop: useMutation({
      mutationFn: (json: MealShoppingInput) => unwrap(meals.shopping.$post({ param, json })),
      onSettled: () => queryClient.invalidateQueries({ queryKey: listKeys.all(householdId) }),
    }),
  }
}

export type MealActions = ReturnType<typeof useMealActions>
