// Which IP addresses the API may connect to when it fetches a page for
// someone (recipe import): the public internet only. Never loopback, private
// networks, link-local (cloud metadata lives there), carrier-grade NAT,
// multicast or reserved ranges, however the address is written.

function ipv4(address: string): number[] | null {
  const parts = address.split('.')
  if (parts.length !== 4) return null
  const bytes = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN))
  return bytes.every((byte) => byte >= 0 && byte <= 255) ? bytes : null
}

function publicIpv4([a, b, c]: number[]): boolean {
  if (a === undefined || b === undefined || c === undefined) return false
  return !(
    a === 0 || // "this network"
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // multicast, reserved, broadcast
  )
}

/** The eight 16-bit groups of an IPv6 address, or null. */
function ipv6(address: string): number[] | null {
  let text =
    address
      .toLowerCase()
      .replace(/^\[|\]$/g, '')
      .split('%')[0] ?? ''
  // An IPv4 tail ("::ffff:10.0.0.1") becomes two groups.
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)
  if (v4?.[1]) {
    const bytes = ipv4(v4[1])
    if (!bytes) return null
    const [a, b, c, d] = bytes as [number, number, number, number]
    text = `${text.slice(0, -v4[1].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null
  return groups.map((group) => Number.parseInt(group, 16))
}

function publicIpv6(groups: number[]): boolean {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d): judge the IPv4 address.
  const embedded = [g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff]
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return publicIpv4(embedded)
  }
  if (g0 === 0x64 && g1 === 0xff9b) return publicIpv4(embedded)
  // Only global unicast (2000::/3), minus documentation and 6to4/Teredo tunnels.
  if ((g0 & 0xe000) !== 0x2000) return false
  if (g0 === 0x2001 && g1 === 0x0db8) return false
  if (g0 === 0x2001 && g1 === 0) return false // Teredo
  if (g0 === 0x2002) return false // 6to4 can wrap private IPv4
  return true
}

/** True only for addresses on the public internet. */
export function isPublicAddress(address: string): boolean {
  const v4 = ipv4(address)
  if (v4) return publicIpv4(v4)
  const v6 = ipv6(address)
  if (v6) return publicIpv6(v6)
  return false
}
