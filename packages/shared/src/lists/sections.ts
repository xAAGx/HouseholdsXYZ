// Store sections for shopping lists, so items are grouped the way you walk a
// shop. Suggested from a small built-in word list (nothing leaves the device);
// people can always pick another section.

export const STORE_SECTIONS = [
  'Fruit & vegetables',
  'Bakery',
  'Dairy & eggs',
  'Meat & fish',
  'Frozen',
  'Pantry',
  'Drinks',
  'Snacks',
  'Household',
  'Personal care',
  'Baby',
  'Pets',
] as const
export type StoreSection = (typeof STORE_SECTIONS)[number]

/** Items without a section are listed last, under this heading. */
export const OTHER_SECTION = 'Other'

const KEYWORDS: Record<StoreSection, readonly string[]> = {
  'Fruit & vegetables': [
    'apple', 'avocado', 'banana', 'berries', 'blueberries', 'broccoli', 'cabbage', 'carrot',
    'celery', 'cucumber', 'garlic', 'ginger', 'grapes', 'herbs', 'kiwi', 'lemon', 'lettuce',
    'lime', 'mango', 'melon', 'mushroom', 'onion', 'orange', 'parsley', 'peach', 'pear',
    'pepper', 'potato', 'salad', 'spinach', 'strawberries', 'tomato', 'zucchini',
  ],
  Bakery: ['bagel', 'baguette', 'bread', 'buns', 'cake', 'croissant', 'muffin', 'pita', 'rolls', 'tortilla', 'wraps'],
  'Dairy & eggs': ['butter', 'cheese', 'cream', 'egg', 'eggs', 'kefir', 'labneh', 'milk', 'mozzarella', 'yogurt', 'yoghurt'],
  'Meat & fish': ['bacon', 'beef', 'chicken', 'fish', 'ham', 'lamb', 'mince', 'pork', 'salmon', 'sausage', 'shrimp', 'steak', 'tuna', 'turkey'],
  Frozen: ['frozen', 'ice', 'icecream', 'peas', 'pizza'],
  Pantry: [
    'beans', 'cereal', 'chickpeas', 'coffee', 'couscous', 'flour', 'honey', 'jam', 'ketchup',
    'lentils', 'mayo', 'mustard', 'noodles', 'oats', 'oil', 'pasta', 'rice', 'salt', 'sauce',
    'spices', 'sugar', 'tea', 'vinegar',
  ],
  Drinks: ['beer', 'cola', 'juice', 'lemonade', 'soda', 'water', 'wine'],
  Snacks: ['biscuits', 'candy', 'chips', 'chocolate', 'cookies', 'crackers', 'crisps', 'nuts', 'popcorn', 'sweets'],
  Household: [
    'batteries', 'bin', 'bleach', 'candles', 'detergent', 'dishwasher', 'foil', 'napkins',
    'paper', 'softener', 'sponges', 'tissues', 'towels',
  ],
  'Personal care': ['conditioner', 'deodorant', 'floss', 'lotion', 'razor', 'shampoo', 'soap', 'sunscreen', 'toothbrush', 'toothpaste'],
  Baby: ['diapers', 'formula', 'nappies', 'wipes'],
  Pets: ['cat', 'catfood', 'dog', 'dogfood', 'kibble', 'litter'],
} // prettier-ignore

const WORD_TO_SECTION = new Map<string, StoreSection>(
  STORE_SECTIONS.flatMap((section) => KEYWORDS[section].map((word) => [word, section] as const)),
)

/** Two-word names that mean something else than their last word. */
const PHRASES = new Map<string, StoreSection>([
  ['ice cream', 'Frozen'],
  ['cat food', 'Pets'],
  ['dog food', 'Pets'],
  ['peanut butter', 'Pantry'],
  ['olive oil', 'Pantry'],
  ['toilet paper', 'Household'],
  ['paper towels', 'Household'],
  ['dish soap', 'Household'],
  ['baby food', 'Baby'],
])

/** A likely store section for an item, or null if nothing matches. */
export function guessStoreSection(text: string): StoreSection | null {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? []
  for (let i = words.length - 2; i >= 0; i--) {
    const phrase = PHRASES.get(`${words[i]} ${words[i + 1]}`)
    if (phrase) return phrase
  }
  // Later words usually name the thing ("cat food", "ice cream"): check them first.
  for (const word of [...words].reverse()) {
    const exact = WORD_TO_SECTION.get(word)
    if (exact) return exact
    const singular = word.endsWith('s') ? WORD_TO_SECTION.get(word.slice(0, -1)) : undefined
    if (singular) return singular
  }
  return null
}
