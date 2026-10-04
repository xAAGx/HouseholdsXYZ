import { Constants, type Enums } from '@households/db'
import { z } from 'zod'

import { isoWeekday } from '../chores/periods'

// Meal planning: a household recipe box and a plan of meals by day. The
// database (meals migration) is the authority.

export type MealSlot = Enums<'meal_slot'>
export const MEAL_SLOTS = Constants.public.Enums.meal_slot

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

/** Quick picks for days without a recipe. */
export const MEAL_SHORTCUTS = ['Leftovers', 'Eating out', 'Takeaway'] as const

/** Tags offered when adding a recipe; people can write their own too. */
export const RECIPE_TAG_SUGGESTIONS = [
  'Quick',
  'Vegetarian',
  'Kids’ favourite',
  'Batch cook',
  'Freezer friendly',
  'Weekend',
] as const

export const MAX_INGREDIENTS = 60
/** Longest range of meals sent to a shopping list at once. */
export const MAX_SHOPPING_DAYS = 31

const dateSchema = z.iso.date({ error: 'Choose a real date.' })

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .transform((value) => value || null)
    .nullable()

const recipeTitleSchema = z
  .string()
  .trim()
  .min(1, 'Give the recipe a name.')
  .max(120, 'Use at most 120 characters.')

const ingredientsSchema = z
  .array(z.string().trim().min(1).max(120, 'Keep each ingredient to 120 characters.'))
  .max(MAX_INGREDIENTS, `Use at most ${MAX_INGREDIENTS} ingredients.`)

const sourceUrlSchema = z
  .string()
  .trim()
  .max(500, 'Use a shorter link.')
  .refine((value) => {
    if (!value) return true
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && !/\s/.test(value)
    } catch {
      return false
    }
  }, 'Use a link that starts with https://')
  .transform((value) => value || null)
  .nullable()

const tagsSchema = z
  .array(z.string().trim().min(1).max(30, 'Keep each tag to 30 characters.'))
  .max(10, 'Use at most 10 tags.')

const servingsSchema = z
  .number({ error: 'Enter a number.' })
  .int('Use a whole number.')
  .min(1, 'At least 1.')
  .max(50, 'At most 50.')
  .nullable()

export const createRecipeInputSchema = z.strictObject({
  title: recipeTitleSchema,
  ingredients: ingredientsSchema,
  tags: tagsSchema.optional(),
  method: optionalText(6000).optional(),
  servings: servingsSchema.optional(),
  sourceUrl: sourceUrlSchema.optional(),
})
export type CreateRecipeInput = z.input<typeof createRecipeInputSchema>

export const updateRecipeInputSchema = z
  .strictObject({
    title: recipeTitleSchema.optional(),
    ingredients: ingredientsSchema.optional(),
    tags: tagsSchema.optional(),
    method: optionalText(6000).optional(),
    servings: servingsSchema.optional(),
    sourceUrl: sourceUrlSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Nothing to change.',
  })
export type UpdateRecipeInput = z.input<typeof updateRecipeInputSchema>

const mealTitleSchema = optionalText(120)

export const createMealInputSchema = z
  .strictObject({
    onDate: dateSchema,
    slot: z.enum(MEAL_SLOTS),
    recipeId: z.uuid().nullable().optional(),
    title: mealTitleSchema.optional(),
    note: optionalText(300).optional(),
    cookId: z.uuid().nullable().optional(),
    /** For how many, when not what the recipe serves. */
    servings: servingsSchema.optional(),
  })
  .refine((input) => Boolean(input.recipeId) || Boolean(input.title), {
    path: ['title'],
    message: 'Choose a recipe or write what it is.',
  })
export type CreateMealInput = z.input<typeof createMealInputSchema>

export const updateMealInputSchema = z
  .strictObject({
    onDate: dateSchema.optional(),
    slot: z.enum(MEAL_SLOTS).optional(),
    recipeId: z.uuid().nullable().optional(),
    title: mealTitleSchema.optional(),
    note: optionalText(300).optional(),
    cookId: z.uuid().nullable().optional(),
    servings: servingsSchema.optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Nothing to change.',
  })
export type UpdateMealInput = z.input<typeof updateMealInputSchema>

/** What the meals planned from…to need, checked against a shopping list. */
export const mealShoppingPreviewInputSchema = z
  .strictObject({ listId: z.uuid(), from: dateSchema, to: dateSchema })
  .refine(({ from, to }) => to >= from, { path: ['to'], message: 'End on or after the start.' })
export type MealShoppingPreviewInput = z.infer<typeof mealShoppingPreviewInputSchema>

/** Puts the chosen things on a shopping list. */
export const mealShoppingInputSchema = z.strictObject({
  listId: z.uuid(),
  items: z
    .array(
      z.strictObject({
        text: z.string().trim().min(1).max(200),
        quantity: z.string().trim().max(40).nullable(),
      }),
    )
    .min(1, 'Choose something to add.')
    .max(100, 'That’s too many at once.'),
})
export type MealShoppingInput = z.infer<typeof mealShoppingInputSchema>

/** Copies one week's plan (Monday to Sunday) to another week. */
export const copyMealWeekInputSchema = z
  .strictObject({ from: dateSchema, to: dateSchema })
  .refine(({ from, to }) => isoWeekday(from) === 1 && isoWeekday(to) === 1 && from !== to, {
    message: 'Choose two different weeks.',
  })
export type CopyMealWeekInput = z.infer<typeof copyMealWeekInputSchema>

/** Reads a recipe from a web page (https only). */
export const importRecipeInputSchema = z.strictObject({
  url: z
    .string()
    .trim()
    .max(500, 'Use a shorter link.')
    .refine((value) => {
      try {
        return new URL(value).protocol === 'https:'
      } catch {
        return false
      }
    }, 'Use a link that starts with https://'),
})

export interface Recipe {
  id: string
  title: string
  ingredients: string[]
  method: string | null
  servings: number | null
  sourceUrl: string | null
  tags: string[]
  archived: boolean
  createdBy: string | null
  /** Whether the viewer may delete it (they added it, or moderate content). */
  canDelete: boolean
}

export interface MealPlanEntry {
  id: string
  onDate: string
  slot: MealSlot
  recipeId: string | null
  /** What to show: the recipe's name, or the name written in. */
  name: string
  /** The name written in, if any (without a recipe, or instead of its name). */
  title: string | null
  note: string | null
  cookId: string | null
  /** For how many, when not what the recipe serves. */
  servings: number | null
}

export interface MealPlanView {
  from: string
  to: string
  entries: MealPlanEntry[]
  recipes: Recipe[]
  /** The last day each recipe was on the plan before this range. */
  lastPlanned: Record<string, string>
  canEdit: boolean
}

/** One thing to buy, before it goes on the list. */
export interface ShoppingPreviewItem {
  text: string
  quantity: string | null
  /** Store section, for shopping lists. */
  category: string | null
  /** Already on the list (not ticked off). */
  onList: boolean
  /** Salt, oil and the like: most kitchens have them. */
  staple: boolean
  /** Which planned recipes need it. */
  recipes: string[]
}

export interface MealShoppingPreview {
  listTitle: string
  items: ShoppingPreviewItem[]
}

export interface MealShoppingResult {
  added: number
  alreadyThere: number
}
