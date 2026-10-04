// Turns recipe ingredients ("2 cups flour", "1/2 tsp salt", "3 eggs") into
// shopping list items: the thing to buy, and how much, with repeats merged.

const UNITS = new Set([
  'g', 'gram', 'grams', 'kg', 'kilo', 'kilos', 'mg', 'ml', 'l', 'litre', 'litres', 'liter',
  'liters', 'cl', 'dl', 'tsp', 'teaspoon', 'teaspoons', 'tbsp', 'tablespoon', 'tablespoons',
  'cup', 'cups', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds', 'pinch', 'pinches',
  'handful', 'handfuls', 'bunch', 'bunches', 'can', 'cans', 'tin', 'tins', 'jar', 'jars',
  'pack', 'packs', 'packet', 'packets', 'clove', 'cloves', 'slice', 'slices', 'piece', 'pieces',
  'stick', 'sticks', 'sprig', 'sprigs', 'bag', 'bags', 'bottle', 'bottles', 'dash',
]) // prettier-ignore

const AMOUNT =
  /^\s*(\d+\s+\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|\d*\s*[½⅓⅔¼¾⅛])(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?/

/** Splits "2 cups flour" into { name: 'flour', quantity: '2 cups' }. */
export function splitIngredient(text: string): { name: string; quantity: string | null } {
  const clean = text.replace(/\s+/g, ' ').trim()
  const amount = AMOUNT.exec(clean)
  if (!amount) return { name: clean, quantity: null }

  let rest = clean.slice(amount[0].length)
  let quantity = amount[0].trim()

  // A unit, attached ("250g") or as the next word ("2 cups"), then an optional "of".
  const unit = /^\s*([A-Za-z]+)\.?(?=\s|$)/.exec(rest)
  if (unit?.[1] && UNITS.has(unit[1].toLowerCase())) {
    quantity += (rest.startsWith(' ') ? ' ' : '') + unit[1]
    rest = rest.slice(unit[0].length)
  }
  rest = rest.replace(/^\s*of\s+/i, '').trim()

  if (!rest) return { name: clean, quantity: null }
  return { name: rest, quantity }
}

/** The same ingredient written differently still matches ("Onions", "onion"). */
export function ingredientKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ies$/, 'y')
    .replace(/oes$/, 'o')
    .replace(/([^s])s$/, '$1')
}

const MAX_QUANTITY = 40

/**
 * Shopping list items for a set of ingredients: one per thing to buy, with
 * the amounts from each recipe joined ("2 cups + 1 cup").
 */
export function mergeIngredients(
  ingredients: readonly string[],
): { text: string; quantity: string | null }[] {
  return mergeIngredientsFrom([{ recipe: '', ingredients }]).map(({ text, quantity }) => ({
    text,
    quantity,
  }))
}

/** Like mergeIngredients, remembering which recipes need each thing. */
export function mergeIngredientsFrom(
  sources: readonly { recipe: string; ingredients: readonly string[] }[],
): { text: string; quantity: string | null; recipes: string[] }[] {
  const merged = new Map<string, { text: string; quantities: string[]; recipes: Set<string> }>()
  for (const { recipe, ingredients } of sources) {
    for (const ingredient of ingredients) {
      const { name, quantity } = splitIngredient(ingredient)
      if (!name) continue
      const key = ingredientKey(name)
      const existing = merged.get(key)
      if (existing) {
        if (quantity) existing.quantities.push(quantity)
        if (recipe) existing.recipes.add(recipe)
      } else {
        merged.set(key, {
          text: name.charAt(0).toUpperCase() + name.slice(1),
          quantities: quantity ? [quantity] : [],
          recipes: new Set(recipe ? [recipe] : []),
        })
      }
    }
  }
  return [...merged.values()].map(({ text, quantities, recipes }) => {
    let quantity = ''
    for (const amount of quantities) {
      const next = quantity ? `${quantity} + ${amount}` : amount
      if (next.length > MAX_QUANTITY) break
      quantity = next
    }
    return { text: text.slice(0, 200), quantity: quantity || null, recipes: [...recipes] }
  })
}

// ── Scaling ("for 6" instead of 4) ──────────────────────────────────────────

const FRACTIONS: Record<string, number> = { '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅛': 1 / 8 } // prettier-ignore
const NICE: [number, string][] = [
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
]

/** "1 1/2" → 1.5, "½" → 0.5, "2,5" → 2.5; null if it isn't a number. */
export function parseAmount(text: string): number | null {
  const value = text.trim()
  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(value)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(value)
  if (fraction) return Number(fraction[1]) / Number(fraction[2])
  const unicode = /^(\d*)\s*([½⅓⅔¼¾⅛])$/.exec(value)
  if (unicode?.[2]) return Number(unicode[1] || 0) + (FRACTIONS[unicode[2]] ?? 0)
  const decimal = /^\d+(?:[.,]\d+)?$/.exec(value)
  if (decimal) return Number(value.replace(',', '.'))
  return null
}

/** 1.5 → "1½", 0.333 → "⅓", 2 → "2", 2.4 → "2.4": how a cook would write it. */
export function formatAmount(value: number): string {
  const whole = Math.floor(value + 1e-9)
  const part = value - whole
  if (part < 0.04) return String(whole)
  if (part > 0.96) return String(whole + 1)
  const nice = NICE.find(([fraction]) => Math.abs(part - fraction) < 0.04)
  if (nice) return `${whole > 0 ? whole : ''}${nice[1]}`
  return String(Math.round(value * 10) / 10)
}

/** "2 cups flour" × 1.5 → "3 cups flour". Lines without an amount stay as they are. */
export function scaleIngredient(text: string, factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < 1e-9) return text
  const clean = text.replace(/\s+/g, ' ').trim()
  const amount = AMOUNT.exec(clean)
  if (!amount) return text
  const [first, second] = amount[0].trim().split(/\s*[-–]\s*/)
  const low = first === undefined ? null : parseAmount(first)
  if (low === null) return text
  const high = second === undefined ? null : parseAmount(second)
  const scaled =
    high === null
      ? formatAmount(low * factor)
      : `${formatAmount(low * factor)}-${formatAmount(high * factor)}`
  const rest = clean.slice(amount[0].length)
  return `${scaled}${rest.startsWith(' ') || /^[A-Za-z]{1,2}\b/.test(rest) ? '' : ' '}${rest}`.trim()
}

/** Things most kitchens already have: unticked when shopping for a week. */
export const PANTRY_STAPLES = [
  'salt',
  'pepper',
  'black pepper',
  'salt and pepper',
  'water',
  'oil',
  'olive oil',
  'vegetable oil',
  'sugar',
  'flour',
] as const

const STAPLE_KEYS = new Set(PANTRY_STAPLES.map(ingredientKey))

export function isPantryStaple(name: string): boolean {
  return STAPLE_KEYS.has(ingredientKey(name))
}
