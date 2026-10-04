// Reads a recipe out of a web page's schema.org data (the JSON-LD most recipe
// sites publish for search engines). Only plain text comes out: no HTML, no
// scripts, no images. The person checks the result before saving it.

export interface RecipeDraft {
  title: string
  ingredients: string[]
  method: string | null
  servings: number | null
  sourceUrl: string
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  deg: '°',
}

/** No control characters (new lines aside). */
const printable = (value: string) =>
  Array.from(value)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0
      return code === 10 || (code >= 32 && code !== 127)
    })
    .join('')

/** Text only: tags removed, entities decoded, spaces tidied. */
export function plainText(value: string): string {
  return printable(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, code: string) => {
      const lower = code.toLowerCase()
      if (lower.startsWith('#x')) return safeChar(Number.parseInt(lower.slice(2), 16), whole)
      if (lower.startsWith('#')) return safeChar(Number.parseInt(lower.slice(1), 10), whole)
      return ENTITIES[lower] ?? whole
    })
    .replace(/[ \t\u00a0]+/g, ' ')
    .trim()
}

function safeChar(code: number, fallback: string): string {
  if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return fallback
  return String.fromCodePoint(code)
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

function isRecipe(node: { [key: string]: Json }): boolean {
  const type = node['@type']
  return type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))
}

/** Every object in a JSON-LD document, through @graph and nested arrays. */
function* nodes(value: Json, depth = 0): Generator<{ [key: string]: Json }> {
  if (depth > 6 || value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) yield* nodes(item, depth + 1)
    return
  }
  yield value
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage']) {
    const child = value[key]
    if (child && typeof child === 'object') yield* nodes(child, depth + 1)
  }
}

function strings(value: Json | undefined): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap((item) => strings(item))
  return []
}

/** Steps from a string, a list of strings, HowToStep objects or HowToSection groups. */
function steps(value: Json | undefined, depth = 0): string[] {
  if (depth > 4 || value === undefined || value === null) return []
  if (typeof value === 'string') return value.split(/\r?\n|<br\s*\/?>/i)
  if (Array.isArray(value)) return value.flatMap((item) => steps(item, depth + 1))
  if (typeof value === 'object') {
    const section = typeof value.name === 'string' && value.itemListElement ? [value.name] : []
    return [
      ...section,
      ...steps(value.itemListElement, depth + 1),
      ...(typeof value.text === 'string' ? [value.text] : []),
    ]
  }
  return []
}

function servings(value: Json | undefined): number | null {
  for (const candidate of [
    ...strings(value),
    ...(typeof value === 'number' ? [String(value)] : []),
  ]) {
    const n = Number(/\d+/.exec(candidate)?.[0])
    if (Number.isInteger(n) && n >= 1 && n <= 50) return n
  }
  return null
}

const JSON_LD = /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi

/** The page's recipe, or null if it doesn't publish one. */
export function recipeFromHtml(html: string, sourceUrl: string): RecipeDraft | null {
  for (const match of html.matchAll(JSON_LD)) {
    let data: Json
    try {
      data = JSON.parse(match[1] ?? '') as Json
    } catch {
      continue
    }
    for (const node of nodes(data)) {
      if (!isRecipe(node)) continue
      const title = plainText(strings(node.name)[0] ?? '').slice(0, 120)
      if (!title) continue
      const ingredients = strings(node.recipeIngredient ?? node.ingredients)
        .map((item) => plainText(item).slice(0, 120))
        .filter(Boolean)
        .slice(0, 60)
      const method = steps(node.recipeInstructions)
        .map(plainText)
        .filter(Boolean)
        .join('\n')
        .slice(0, 6000)
      return {
        title,
        ingredients,
        method: method || null,
        servings: servings(node.recipeYield),
        sourceUrl,
      }
    }
  }
  return null
}
