import { describe, expect, it } from 'vitest'

import { redact, redactString } from './redact'

describe('redact', () => {
  it('masks sensitive keys at any depth', () => {
    expect(
      redact({
        user: { email: 'pat@example.com', displayName: 'Pat' },
        headers: { authorization: 'Bearer abc', 'content-type': 'application/json' },
        password: 'hunter2',
      }),
    ).toEqual({
      user: { email: '[REDACTED]', displayName: 'Pat' },
      headers: { authorization: '[REDACTED]', 'content-type': 'application/json' },
      password: '[REDACTED]',
    })
  })

  it('masks credentials and contact details inside free text', () => {
    const text = redactString(
      'failed for pat@example.com with eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl and sb_secret_abc123 call +44 20 7946 0958',
    )
    expect(text).not.toContain('pat@example.com')
    expect(text).not.toContain('eyJ')
    expect(text).not.toContain('sb_secret_abc123')
    expect(text).not.toContain('7946')
  })

  it('leaves dates, times and ids readable', () => {
    const line = 'at 2026-09-29T12:30:00Z request 87cdde1e-dd78-47ff-b9af-d048bb9250f5'
    expect(redactString(line)).toBe(line)
  })

  it('summarises errors without stacks', () => {
    expect(redact(new Error('boom for pat@example.com'))).toEqual({
      name: 'Error',
      message: 'boom for [EMAIL]',
    })
  })
})
