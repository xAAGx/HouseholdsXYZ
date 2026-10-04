import { describe, expect, it } from 'vitest'

import { storageFileName } from '../documents/schemas'
import { netBalances, settleUp, splitShares } from './balances'
import { currencyDigits, isCurrency, parseMoney } from './format'

describe('currencies', () => {
  it('know their decimals', () => {
    expect(currencyDigits('USD')).toBe(2)
    expect(currencyDigits('JPY')).toBe(0)
    expect(currencyDigits('KWD')).toBe(3)
    expect(isCurrency('EGP')).toBe(true)
    expect(isCurrency('XYZ1')).toBe(false)
  })

  it.each([
    ['12.5', 2, 1250],
    ['12,50', 2, 1250],
    ['1,200', 2, 120000],
    ['1.200,50', 2, 120050],
    ['1 200', 0, 1200],
    ['0.125', 3, 125],
    ['12.345', 2, null],
    ['abc', 2, null],
    ['', 2, null],
  ])('read %s (%i decimals) as %s', (text, digits, minor) => {
    expect(parseMoney(text, digits)).toBe(minor)
  })
})

describe('balances', () => {
  const [maya, sam, rosa] = ['maya', 'sam', 'rosa']

  it('split evenly, spare cents to the first people', () => {
    expect([...splitShares(1000, [maya, sam, rosa]).values()]).toEqual([334, 333, 333])
  })

  it('net what people paid against their shares and settle-ups', () => {
    const net = netBalances(
      [
        { amountMinor: 9000, paidBy: maya, splitBetween: [maya, sam, rosa] },
        { amountMinor: 3000, paidBy: sam, splitBetween: [maya, sam] },
        { amountMinor: 5000, paidBy: rosa, splitBetween: [] },
      ],
      [{ fromId: rosa, toId: maya, amountMinor: 1000 }],
    )
    expect(Object.fromEntries(net)).toEqual({ maya: 3500, sam: -1500, rosa: -2000 })
  })

  it('settle up in the fewest payments', () => {
    const debts = settleUp(
      new Map([
        [maya, 3500],
        [sam, -1500],
        [rosa, -2000],
      ]),
    )
    expect(debts).toEqual([
      { fromId: rosa, toId: maya, amountMinor: 2000 },
      { fromId: sam, toId: maya, amountMinor: 1500 },
    ])
  })
})

describe('storageFileName', () => {
  it('keeps only safe characters after a unique prefix', () => {
    expect(storageFileName('a1b2', 'Leo’s passport (front).jpg')).toBe(
      'a1b2-Leo-s-passport-front-.jpg',
    )
    expect(storageFileName('a1b2', '../../etc/passwd')).toBe('a1b2-etc-passwd')
    expect(storageFileName('a1b2', '!!!')).toBe('a1b2-file')
    expect(storageFileName('a1b2', 'x'.repeat(300)).length).toBeLessThanOrEqual(128)
  })
})
