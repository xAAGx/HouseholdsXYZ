import { describe, expect, it } from 'vitest'

import { newPasswordSchema } from './password'
import { normalizePhone } from './phone'
import {
  ageOn,
  dateOfBirthSchema,
  resetPasswordInputSchema,
  signUpInputSchema,
  signUpMetadata,
} from './schemas'

const today = new Date()
const yearsAgo = (years: number, days = 0) => {
  const d = new Date(
    Date.UTC(today.getUTCFullYear() - years, today.getUTCMonth(), today.getUTCDate() + days),
  )
  return d.toISOString().slice(0, 10)
}

describe('newPasswordSchema', () => {
  it('accepts a strong password', () => {
    expect(newPasswordSchema.safeParse('Correct-Horse-9-battery').success).toBe(true)
  })

  it.each([
    ['too short', 'Aa1!aaaa'],
    ['no uppercase', 'correct-horse-9-battery'],
    ['no lowercase', 'CORRECT-HORSE-9-BATTERY'],
    ['no digit', 'Correct-Horse-battery'],
    ['no symbol', 'CorrectHorse9battery'],
    ['over 72 bytes', `Aa1!${'é'.repeat(40)}`],
  ])('rejects %s', (_label, password) => {
    expect(newPasswordSchema.safeParse(password).success).toBe(false)
  })

  it('lists every missing requirement in one message', () => {
    const result = newPasswordSchema.safeParse('short')
    expect(result.error?.issues[0]?.message).toMatch(/uppercase.*number.*symbol/)
  })
})

describe('age', () => {
  it('counts whole years, birthday-aware', () => {
    expect(ageOn('2000-06-15', new Date('2018-06-14T12:00:00Z'))).toBe(17)
    expect(ageOn('2000-06-15', new Date('2018-06-15T12:00:00Z'))).toBe(18)
  })

  it('accepts someone who turns 18 today, rejects someone a day short', () => {
    expect(dateOfBirthSchema.safeParse(yearsAgo(18)).success).toBe(true)
    expect(dateOfBirthSchema.safeParse(yearsAgo(18, 1)).success).toBe(false)
  })

  it.each(['2001-02-30', '1899-12-31', '15/06/2000', ''])('rejects %s', (value) => {
    expect(dateOfBirthSchema.safeParse(value).success).toBe(false)
  })
})

describe('normalizePhone', () => {
  it.each([
    ['(415) 555-2671', 'US', '+14155552671'],
    ['020 7946 0958', 'GB', '+442079460958'],
    ['+44 20 7946 0958', 'US', '+442079460958'],
    ['010 1234 5678', 'EG', '+201012345678'],
  ])('%s in %s → %s', (input, country, expected) => {
    expect(normalizePhone(input, country)).toBe(expected)
  })

  it.each([
    ['123', 'US'],
    ['not a number', 'GB'],
  ])('rejects %s', (input, country) => {
    expect(normalizePhone(input, country)).toBeNull()
  })
})

describe('signUpInputSchema', () => {
  const valid = {
    firstName: ' Pat ',
    lastName: 'Smith',
    email: 'Pat@Example.com',
    password: 'Correct-Horse-9-battery',
    dateOfBirth: '1990-05-01',
    countryCode: 'us',
    cityId: 5391959,
    phone: '(415) 555-2671',
    acceptTerms: true,
  }

  it('normalizes a valid sign-up', () => {
    const data = signUpInputSchema.parse(valid)
    expect(data).toMatchObject({
      firstName: 'Pat',
      email: 'pat@example.com',
      countryCode: 'US',
      phone: '+14155552671',
    })
  })

  it('requires accepting the terms', () => {
    expect(signUpInputSchema.safeParse({ ...valid, acceptTerms: false }).success).toBe(false)
  })

  it('points a bad phone number at the phone field', () => {
    const result = signUpInputSchema.safeParse({ ...valid, phone: '12' })
    expect(result.error?.issues.map((i) => i.path.join('.'))).toEqual(['phone'])
  })

  it('rejects unknown fields', () => {
    expect(signUpInputSchema.safeParse({ ...valid, isAdmin: true }).success).toBe(false)
  })

  it('builds exactly the metadata the database expects', () => {
    expect(signUpMetadata(signUpInputSchema.parse(valid))).toEqual({
      first_name: 'Pat',
      last_name: 'Smith',
      date_of_birth: '1990-05-01',
      phone: '+14155552671',
      city_id: 5391959,
    })
  })
})

describe('resetPasswordInputSchema', () => {
  it('requires the confirmation to match', () => {
    const result = resetPasswordInputSchema.safeParse({
      password: 'Correct-Horse-9-battery',
      confirmPassword: 'Correct-Horse-9-batterY',
    })
    expect(result.error?.issues[0]?.path).toEqual(['confirmPassword'])
  })
})
