import { describe, expect, it } from 'vitest'

import { formatAmount, isPantryStaple, parseAmount, scaleIngredient } from './ingredients'
import { plainText, recipeFromHtml } from './recipe-import'

describe('scaling', () => {
  it.each([
    ['1 1/2', 1.5],
    ['½', 0.5],
    ['2½', 2.5],
    ['2,5', 2.5],
    ['3/4', 0.75],
    ['a', null],
  ])('reads %s', (text, value) => {
    expect(parseAmount(text)).toBe(value)
  })

  it.each([
    [1.5, '1½'],
    [0.333, '⅓'],
    [2, '2'],
    [2.4, '2.4'],
    [0.75, '¾'],
  ])('writes %s as %s', (value, text) => {
    expect(formatAmount(value)).toBe(text)
  })

  it.each([
    ['2 cups flour', 1.5, '3 cups flour'],
    ['250g butter', 1.5, '375g butter'],
    ['1 1/2 tsp salt', 2, '3 tsp salt'],
    ['2-3 cloves garlic', 2, '4-6 cloves garlic'],
    ['½ lemon', 2, '1 lemon'],
    ['Salt and pepper', 2, 'Salt and pepper'],
    ['3 eggs', 1, '3 eggs'],
  ])('scales %s × %s', (text, factor, scaled) => {
    expect(scaleIngredient(text, factor)).toBe(scaled)
  })

  it('knows pantry staples', () => {
    expect(isPantryStaple('Olive oil')).toBe(true)
    expect(isPantryStaple('salt')).toBe(true)
    expect(isPantryStaple('chickpeas')).toBe(false)
  })
})

const page = (jsonLd: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head></html>`

describe('recipeFromHtml', () => {
  it('reads a schema.org recipe, including from @graph', () => {
    const html = page({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'Ignore me' },
        {
          '@type': ['Recipe'],
          name: 'Chickpea &amp; spinach curry',
          recipeIngredient: ['2 cans chickpeas', '<b>1</b> onion'],
          recipeInstructions: [
            {
              '@type': 'HowToSection',
              name: 'Sauce',
              itemListElement: [
                { '@type': 'HowToStep', text: 'Soften the onion.' },
                { '@type': 'HowToStep', text: 'Add the paste.' },
              ],
            },
            'Serve with rice.',
          ],
          recipeYield: ['4 servings'],
        },
      ],
    })
    expect(recipeFromHtml(html, 'https://example.com/curry')).toEqual({
      title: 'Chickpea & spinach curry',
      ingredients: ['2 cans chickpeas', '1 onion'],
      method: 'Sauce\nSoften the onion.\nAdd the paste.\nServe with rice.',
      servings: 4,
      sourceUrl: 'https://example.com/curry',
    })
  })

  it('returns nothing for pages without a recipe, or with broken data', () => {
    expect(recipeFromHtml('<html></html>', 'https://example.com')).toBeNull()
    expect(
      recipeFromHtml(
        '<script type="application/ld+json">{not json</script>',
        'https://example.com',
      ),
    ).toBeNull()
  })

  it('keeps only plain text', () => {
    expect(plainText('<script>alert(1)</script>Soup &#38; bread &#x26; &nbsp;more')).toBe(
      'alert(1) Soup & bread & more',
    )
  })
})
