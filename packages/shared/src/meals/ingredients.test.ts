import { describe, expect, it } from 'vitest'

import { ingredientKey, mergeIngredients, splitIngredient } from './ingredients'
import { createMealInputSchema, createRecipeInputSchema } from './schemas'

describe('splitIngredient', () => {
  it.each([
    ['2 cups flour', 'flour', '2 cups'],
    ['250g butter', 'butter', '250g'],
    ['1 1/2 tsp salt', 'salt', '1 1/2 tsp'],
    ['½ lemon', 'lemon', '½'],
    ['3 eggs', 'eggs', '3'],
    ['2 cans of chickpeas', 'chickpeas', '2 cans'],
    ['Salt and pepper', 'Salt and pepper', null],
    ['2-3 cloves garlic', 'garlic', '2-3 cloves'],
  ])('%s → %s (%s)', (text, name, quantity) => {
    expect(splitIngredient(text)).toEqual({ name, quantity })
  })

  it('keeps a lone amount as the name', () => {
    expect(splitIngredient('4')).toEqual({ name: '4', quantity: null })
  })
})

describe('ingredientKey', () => {
  it('matches singular and plural', () => {
    expect(ingredientKey('Onions')).toBe(ingredientKey('onion'))
    expect(ingredientKey('tomatoes')).toBe(ingredientKey('Tomato'))
    expect(ingredientKey('berries')).toBe(ingredientKey('berry'))
    expect(ingredientKey('Olives')).toBe(ingredientKey('olive'))
    expect(ingredientKey('glass noodles')).not.toBe(ingredientKey('glas noodle'))
  })
})

describe('mergeIngredients', () => {
  it('lists each thing once, joining the amounts', () => {
    expect(mergeIngredients(['2 onions', '1 onion', 'rice', '200g rice', 'Salt'])).toEqual([
      { text: 'Onions', quantity: '2 + 1' },
      { text: 'Rice', quantity: '200g' },
      { text: 'Salt', quantity: null },
    ])
  })

  it('keeps amounts short enough for a list item', () => {
    const many = Array.from({ length: 20 }, () => '100g flour')
    const [flour] = mergeIngredients(many)
    expect(flour?.quantity?.length).toBeLessThanOrEqual(40)
  })
})

describe('recipe and meal input', () => {
  it('only links to https pages', () => {
    const base = { title: 'Pilaf', ingredients: [] }
    expect(
      createRecipeInputSchema.safeParse({ ...base, sourceUrl: 'https://ex.am/ple' }).success,
    ).toBe(true)
    expect(
      createRecipeInputSchema.safeParse({
        ...base,
        sourceUrl: ['javascript', 'alert(1)'].join(':'),
      }).success,
    ).toBe(false)
    expect(
      createRecipeInputSchema.safeParse({ ...base, sourceUrl: 'http://ex.am/ple' }).success,
    ).toBe(false)
  })

  it('needs a recipe or a name', () => {
    const base = { onDate: '2026-10-06', slot: 'dinner' }
    expect(createMealInputSchema.safeParse(base).success).toBe(false)
    expect(createMealInputSchema.safeParse({ ...base, title: '  ' }).success).toBe(false)
    expect(createMealInputSchema.safeParse({ ...base, title: 'Leftovers' }).success).toBe(true)
  })
})
