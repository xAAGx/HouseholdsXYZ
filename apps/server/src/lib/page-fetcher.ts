// Node-only: fetches a public web page for recipe import. Imported by the
// entry files only and handed to createApp() as a dependency.
//
// Guards against being used to reach anything but the public internet:
// https on port 443 only, no credentials in URLs, every address checked after
// DNS lookup (and for IP literals), redirects followed by hand (at most 3)
// and checked again, HTML only, 2 MB and 8 seconds at most, no cookies.
import { lookup, type LookupAddress } from 'node:dns'
import { request } from 'node:https'
import { isIP, type LookupFunction } from 'node:net'

import { isPublicAddress } from './net'
import type { PageFetcher } from './pages'

const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 8000
const MAX_REDIRECTS = 3

export class PageFetchError extends Error {}

/** DNS lookup that refuses names resolving to any non-public address. */
const publicLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { all: true }, (error, addresses: LookupAddress[]) => {
    if (error) {
      callback(error, '', 0)
      return
    }
    if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) {
      callback(new PageFetchError('not a public address'), '', 0)
      return
    }
    if (options.all) {
      ;(callback as unknown as (e: null, list: LookupAddress[]) => void)(null, addresses)
    } else {
      const first = addresses[0]!
      callback(null, first.address, first.family)
    }
  })
}

function checkUrl(url: URL) {
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new PageFetchError('https only')
  }
  if (url.port && url.port !== '443') throw new PageFetchError('port 443 only')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) && !isPublicAddress(host)) throw new PageFetchError('not a public address')
}

type Hop = { kind: 'redirect'; location: string } | { kind: 'page'; html: string }

function fetchOnce(url: URL): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'GET',
        lookup: publicLookup,
        timeout: TIMEOUT_MS,
        headers: {
          'User-Agent': 'Households.xyz recipe import',
          Accept: 'text/html,application/xhtml+xml',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          resolve({ kind: 'redirect', location: res.headers.location })
          return
        }
        const type = String(res.headers['content-type'] ?? '')
        if (status !== 200 || !/html/i.test(type)) {
          res.resume()
          reject(new PageFetchError(`unexpected response ${status}`))
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_BYTES) {
            req.destroy(new PageFetchError('page too large'))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => resolve({ kind: 'page', html: Buffer.concat(chunks).toString('utf8') }))
        res.on('error', reject)
      },
    )
    req.on('timeout', () => req.destroy(new PageFetchError('timed out')))
    req.on('error', reject)
    req.end()
  })
}

export function createPageFetcher(): PageFetcher {
  return {
    async fetchHtml(address) {
      let url = new URL(address)
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        checkUrl(url)
        const result = await fetchOnce(url)
        if (result.kind === 'page') return result.html
        url = new URL(result.location, url)
      }
      throw new PageFetchError('too many redirects')
    },
  }
}
