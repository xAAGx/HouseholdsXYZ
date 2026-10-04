import { describe, expect, it } from 'vitest'

import { isPublicAddress } from './net'

describe('isPublicAddress', () => {
  it.each(['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111', '2a00:1450:4001:81c::200e'])(
    'allows %s',
    (address) => {
      expect(isPublicAddress(address)).toBe(true)
    },
  )

  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '169.254.169.254', // cloud metadata
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:169.254.169.254',
    '64:ff9b::a9fe:a9fe',
    '2002:c0a8:0101::1',
    '2001:db8::1',
    '[::1]',
    'localhost',
    '1.2.3',
    '',
  ])('refuses %s', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })
})
