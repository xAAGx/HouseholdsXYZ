import {
  addDays,
  ApiError,
  calendarRangeSchema,
  copyMealWeekInputSchema,
  createMealInputSchema,
  createRecipeInputSchema,
  daysBetween,
  guessStoreSection,
  importRecipeInputSchema,
  ingredientKey,
  isPantryStaple,
  MAX_SHOPPING_DAYS,
  mealShoppingInputSchema,
  mealShoppingPreviewInputSchema,
  mergeIngredientsFrom,
  recipeFromHtml,
  scaleIngredient,
  updateMealInputSchema,
  updateRecipeInputSchema,
  type MealPlanEntry,
  type MealPlanView,
  type MealShoppingPreview,
  type MealShoppingResult,
  type Recipe,
} from '@households/shared'
import type { HouseholdsSupabaseClient } from '@households/db'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

import { toApiError } from '../lib/errors'
import { validationHook } from '../lib/validation'
import type { AppEnv } from '../types'

// Mounted at /v1/households/:id/meals. The recipe box and the meal plan are
// the household's; everything runs as the user under RLS.

const householdParam = zValidator('param', z.object({ id: z.uuid() }), validationHook)
const entryParam = zValidator(
  'param',
  z.object({ id: z.uuid(), entryId: z.uuid() }),
  validationHook,
)
const recipeParam = zValidator(
  'param',
  z.object({ id: z.uuid(), recipeId: z.uuid() }),
  validationHook,
)

const RECIPE_FIELDS =
  'id, title, ingredients, method, servings, source_url, tags, archived_at, created_by'
const ENTRY_FIELDS = 'id, on_date, slot, recipe_id, title, note, cook_id, servings'

const notFound = () => new ApiError('NOT_FOUND')
const dayIsFull = (cause: unknown) =>
  new ApiError('CONFLICT', 'That day is full.', undefined, { cause })

/** Sets only the fields that were sent (undefined: leave as is). */
function defined<T extends Record<string, unknown>>(fields: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}

/** A list the caller can add to, or a 404 / clear refusal. */
async function writableList(db: HouseholdsSupabaseClient, householdId: string, listId: string) {
  const { data, error } = await db
    .from('lists')
    .select('title, kind, archived_at')
    .eq('id', listId)
    .eq('household_id', householdId)
    .maybeSingle()
  if (error) throw toApiError(error)
  if (!data) throw notFound()
  if (data.archived_at) {
    throw new ApiError('VALIDATION_FAILED', 'That list is archived. Restore it first.')
  }
  return data
}

/** What's on a list and not ticked off, by ingredient. */
async function openItemKeys(db: HouseholdsSupabaseClient, listId: string) {
  const { data, error } = await db
    .from('list_items')
    .select('text')
    .eq('list_id', listId)
    .is('done_at', null)
  if (error) throw toApiError(error)
  return new Set(data.map((item) => ingredientKey(item.text)))
}

export const mealRoutes = new Hono<AppEnv>()
  // The plan between two dates, the whole recipe box (for picking), and when
  // each recipe was last on the plan.
  .get('/', householdParam, zValidator('query', calendarRangeSchema, validationHook), async (c) => {
    const { id } = c.req.valid('param')
    const { from, to } = c.req.valid('query')
    const db = c.var.supabase
    const me = c.var.auth.userId

    const [membership, entries, recipes, history, permissions] = await Promise.all([
      db
        .from('household_members')
        .select('role')
        .eq('household_id', id)
        .eq('profile_id', me)
        .eq('status', 'active')
        .maybeSingle(),
      db
        .from('meal_plan_entries')
        .select(ENTRY_FIELDS)
        .eq('household_id', id)
        .gte('on_date', from)
        .lte('on_date', to)
        .order('on_date', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(1000),
      db
        .from('recipes')
        .select(RECIPE_FIELDS)
        .eq('household_id', id)
        .order('title', { ascending: true })
        .limit(1000),
      db
        .from('meal_plan_entries')
        .select('recipe_id, on_date')
        .eq('household_id', id)
        .not('recipe_id', 'is', null)
        .lt('on_date', from)
        .gte('on_date', addDays(from, -365))
        .order('on_date', { ascending: false })
        .limit(2000),
      db.rpc('my_household_permissions', { p_household_id: id }),
    ])
    for (const result of [membership, entries, recipes, history, permissions]) {
      if (result.error) throw toApiError(result.error)
    }
    if (!membership.data) throw notFound()

    const can = new Set(permissions.data ?? [])
    const box: Recipe[] = (recipes.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      ingredients: row.ingredients,
      method: row.method,
      servings: row.servings,
      sourceUrl: row.source_url,
      tags: row.tags,
      archived: row.archived_at !== null,
      createdBy: row.created_by,
      canDelete: row.created_by === me || can.has('moderate_content'),
    }))
    const titles = new Map(box.map((recipe) => [recipe.id, recipe.title]))
    const plan: MealPlanEntry[] = (entries.data ?? []).map((row) => ({
      id: row.id,
      onDate: row.on_date,
      slot: row.slot,
      recipeId: row.recipe_id,
      name: row.title ?? (row.recipe_id && titles.get(row.recipe_id)) ?? 'A meal',
      title: row.title,
      note: row.note,
      cookId: row.cook_id,
      servings: row.servings,
    }))
    const lastPlanned: Record<string, string> = {}
    for (const row of history.data ?? []) {
      if (row.recipe_id && !lastPlanned[row.recipe_id]) lastPlanned[row.recipe_id] = row.on_date
    }

    const view: MealPlanView = {
      from,
      to,
      entries: plan,
      recipes: box,
      lastPlanned,
      canEdit: can.has('create_posts'),
    }
    return c.json(view)
  })

  .post(
    '/entries',
    householdParam,
    zValidator('json', createMealInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const { data, error } = await c.var.supabase
        .from('meal_plan_entries')
        .insert({
          household_id: id,
          on_date: input.onDate,
          slot: input.slot,
          recipe_id: input.recipeId ?? null,
          title: input.title ?? null,
          note: input.note ?? null,
          cook_id: input.cookId ?? null,
          servings: input.servings ?? null,
        })
        .select('id')
        .single()
      if (error) throw error.code === '54000' ? dayIsFull(error) : toApiError(error)
      return c.json({ id: data.id }, 201)
    },
  )

  .patch(
    '/entries/:entryId',
    entryParam,
    zValidator('json', updateMealInputSchema, validationHook),
    async (c) => {
      const { id, entryId } = c.req.valid('param')
      const input = c.req.valid('json')
      const { data, error } = await c.var.supabase
        .from('meal_plan_entries')
        .update(
          defined({
            on_date: input.onDate,
            slot: input.slot,
            recipe_id: input.recipeId,
            title: input.title,
            note: input.note,
            cook_id: input.cookId,
            servings: input.servings,
          }),
        )
        .eq('id', entryId)
        .eq('household_id', id)
        .select('id')
      if (error) throw error.code === '54000' ? dayIsFull(error) : toApiError(error)
      if (data.length === 0) throw notFound()
      return c.json({ ok: true as const })
    },
  )

  .delete('/entries/:entryId', entryParam, async (c) => {
    const { id, entryId } = c.req.valid('param')
    const { data, error } = await c.var.supabase
      .from('meal_plan_entries')
      .delete()
      .eq('id', entryId)
      .eq('household_id', id)
      .select('id')
    if (error) throw toApiError(error)
    if (data.length === 0) throw notFound()
    return c.json({ ok: true as const })
  })

  // Copies one week's meals (who's cooking, how many) to another week.
  .post(
    '/copy-week',
    householdParam,
    zValidator('json', copyMealWeekInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const { from, to } = c.req.valid('json')
      const db = c.var.supabase
      const { data: source, error } = await db
        .from('meal_plan_entries')
        .select('on_date, slot, recipe_id, title, note, cook_id, servings')
        .eq('household_id', id)
        .gte('on_date', from)
        .lte('on_date', addDays(from, 6))
        .order('on_date', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw toApiError(error)
      if (source.length === 0) return c.json({ copied: 0 })

      const shift = daysBetween(from, to)
      const { error: insertError } = await db.from('meal_plan_entries').insert(
        source.map((entry) => ({
          household_id: id,
          on_date: addDays(entry.on_date, shift),
          slot: entry.slot,
          recipe_id: entry.recipe_id,
          title: entry.title,
          note: entry.note,
          cook_id: entry.cook_id,
          servings: entry.servings,
        })),
      )
      if (insertError) {
        throw insertError.code === '54000' ? dayIsFull(insertError) : toApiError(insertError)
      }
      return c.json({ copied: source.length })
    },
  )

  .post(
    '/recipes',
    householdParam,
    zValidator('json', createRecipeInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const { data, error } = await c.var.supabase
        .from('recipes')
        .insert({
          household_id: id,
          title: input.title,
          ingredients: input.ingredients,
          tags: input.tags ?? [],
          method: input.method ?? null,
          servings: input.servings ?? null,
          source_url: input.sourceUrl ?? null,
        })
        .select('id')
        .single()
      if (error) throw toApiError(error)
      return c.json({ id: data.id }, 201)
    },
  )

  // Reads a recipe from a web page, for the person to check before saving.
  // Only members who can add recipes may use it (it fetches other sites).
  .post(
    '/recipes/import',
    householdParam,
    zValidator('json', importRecipeInputSchema, validationHook),
    async (c) => {
      const pages = c.var.pages
      if (!pages) throw new ApiError('UNAVAILABLE', 'Importing recipes isn’t switched on.')
      const { id } = c.req.valid('param')
      const { data: permissions, error } = await c.var.supabase.rpc('my_household_permissions', {
        p_household_id: id,
      })
      if (error) throw toApiError(error)
      if (!permissions.includes('create_posts')) throw notFound()

      const { url } = c.req.valid('json')
      let html: string
      try {
        html = await pages.fetchHtml(url)
      } catch {
        throw new ApiError(
          'VALIDATION_FAILED',
          'We couldn’t open that page. Check the link, or add the recipe by hand.',
        )
      }
      const draft = recipeFromHtml(html, url)
      if (!draft) {
        throw new ApiError(
          'VALIDATION_FAILED',
          'That page doesn’t share its recipe in a way we can read. Add it by hand instead.',
        )
      }
      return c.json({ draft })
    },
  )

  .patch(
    '/recipes/:recipeId',
    recipeParam,
    zValidator('json', updateRecipeInputSchema, validationHook),
    async (c) => {
      const { id, recipeId } = c.req.valid('param')
      const input = c.req.valid('json')
      const { data, error } = await c.var.supabase
        .from('recipes')
        .update(
          defined({
            title: input.title,
            ingredients: input.ingredients,
            tags: input.tags,
            method: input.method,
            servings: input.servings,
            source_url: input.sourceUrl,
            archived_at:
              input.archived === undefined
                ? undefined
                : input.archived
                  ? new Date().toISOString()
                  : null,
          }),
        )
        .eq('id', recipeId)
        .eq('household_id', id)
        .select('id')
      if (error) throw toApiError(error)
      if (data.length === 0) throw notFound()
      return c.json({ ok: true as const })
    },
  )

  .delete('/recipes/:recipeId', recipeParam, async (c) => {
    const { id, recipeId } = c.req.valid('param')
    const { data, error } = await c.var.supabase
      .from('recipes')
      .delete()
      .eq('id', recipeId)
      .eq('household_id', id)
      .select('id')
    if (error) throw toApiError(error)
    if (data.length === 0) throw notFound()
    return c.json({ ok: true as const })
  })

  // What the meals planned between two dates need, scaled to how many each
  // is for, merged, and checked against a list: for the person to choose from.
  .post(
    '/shopping/preview',
    householdParam,
    zValidator('json', mealShoppingPreviewInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const { listId, from, to } = c.req.valid('json')
      if (daysBetween(from, to) > MAX_SHOPPING_DAYS) {
        throw new ApiError('VALIDATION_FAILED', 'Choose a month or less.')
      }
      const db = c.var.supabase
      const list = await writableList(db, id, listId)
      const { data: entries, error } = await db
        .from('meal_plan_entries')
        .select('recipe_id, servings')
        .eq('household_id', id)
        .gte('on_date', from)
        .lte('on_date', to)
        .not('recipe_id', 'is', null)
      if (error) throw toApiError(error)

      const preview: MealShoppingPreview = { listTitle: list.title, items: [] }
      if (entries.length === 0) return c.json(preview)

      const { data: recipes, error: recipesError } = await db
        .from('recipes')
        .select('id, title, ingredients, servings')
        .in('id', [...new Set(entries.flatMap((entry) => entry.recipe_id ?? []))])
      if (recipesError) throw toApiError(recipesError)
      const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]))

      // A recipe planned twice needs its ingredients twice; "for 6" scales a
      // recipe that serves 4 by 1.5.
      const sources = entries.flatMap((entry) => {
        const recipe = entry.recipe_id ? byId.get(entry.recipe_id) : undefined
        if (!recipe) return []
        const factor = entry.servings && recipe.servings ? entry.servings / recipe.servings : 1
        return [
          {
            recipe: recipe.title,
            ingredients: recipe.ingredients.map((item) => scaleIngredient(item, factor)),
          },
        ]
      })
      const onList = await openItemKeys(db, listId)
      const shopping = list.kind === 'shopping'
      preview.items = mergeIngredientsFrom(sources).map((item) => ({
        ...item,
        category: shopping ? guessStoreSection(item.text) : null,
        onList: onList.has(ingredientKey(item.text)),
        staple: isPantryStaple(item.text),
      }))
      return c.json(preview)
    },
  )

  // Puts the chosen things on the list, skipping any already there.
  .post(
    '/shopping',
    householdParam,
    zValidator('json', mealShoppingInputSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param')
      const { listId, items } = c.req.valid('json')
      const db = c.var.supabase
      const list = await writableList(db, id, listId)
      const onList = await openItemKeys(db, listId)

      const seen = new Set<string>()
      const toAdd = items.filter((item) => {
        const key = ingredientKey(item.text)
        if (onList.has(key) || seen.has(key)) return false
        seen.add(key)
        return true
      })
      const result: MealShoppingResult = {
        added: toAdd.length,
        alreadyThere: items.length - toAdd.length,
      }
      if (toAdd.length > 0) {
        const shopping = list.kind === 'shopping'
        const { error } = await db.from('list_items').insert(
          toAdd.map((item) => ({
            list_id: listId,
            household_id: id,
            position: 0,
            text: item.text,
            quantity: item.quantity,
            category: shopping ? guessStoreSection(item.text) : null,
          })),
        )
        if (error) {
          if (error.code === '54000') {
            throw new ApiError('CONFLICT', 'That list is full.', undefined, { cause: error })
          }
          throw toApiError(error)
        }
      }
      return c.json(result)
    },
  )
