import type { AppType } from '@households/server/app-type'
import { hc } from 'hono/client'

export interface ApiClientOptions {
  /** e.g. https://api.households.xyz (http is accepted only for localhost). */
  baseUrl: string
  /** Returns the current Supabase access token, or null when signed out. */
  getAccessToken: () => Promise<string | null | undefined>
  fetch?: typeof globalThis.fetch
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function requestUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input
  if (typeof input === 'string') return new URL(input)
  return new URL(input.url)
}

/**
 * Fully typed client for the Households.xyz API (Hono RPC): routes, params,
 * bodies and responses all come from the server's own types.
 *
 * The access token is attached only to requests for the configured API origin,
 * and cookies are never sent.
 */
export function createApiClient({
  baseUrl,
  getAccessToken,
  fetch: fetchImpl = globalThis.fetch,
}: ApiClientOptions) {
  const base = new URL(baseUrl)
  if (base.protocol !== 'https:' && !LOOPBACK_HOSTS.has(base.hostname)) {
    throw new Error('The API base URL must use https.')
  }

  return hc<AppType>(base.origin, {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      if (requestUrl(input).origin !== base.origin) {
        throw new Error('Refusing to send credentials to a different origin.')
      }
      const headers = new Headers(init?.headers)
      const token = await getAccessToken()
      if (token) headers.set('Authorization', `Bearer ${token}`)
      return fetchImpl(input, { ...init, headers, credentials: 'omit' })
    },
  })
}

export type ApiClient = ReturnType<typeof createApiClient>
