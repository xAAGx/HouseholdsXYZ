import { describe, expect, it } from 'vitest'

import { safeInternalPath } from './url'

describe('safeInternalPath', () => {
  it.each(['/app', '/house/TheSmiths?tab=feed#top', '/'])('keeps internal path %s', (path) => {
    expect(safeInternalPath(path)).toBe(path)
  })

  it.each([
    'https://evil.example/app',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    // eslint-disable-next-line no-script-url -- asserting that it is rejected
    'javascript:alert(1)',
    'app',
    '',
    undefined,
    42,
  ])('rejects %s', (candidate) => {
    expect(safeInternalPath(candidate, '/fallback')).toBe('/fallback')
  })
})
