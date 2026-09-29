/**
 * Guards against the most damaging Supabase mistake: shipping a privileged key
 * (secret / service_role) to a browser or phone, where anyone can extract it
 * and bypass Row Level Security entirely.
 */

const SECRET_KEY_PREFIX = 'sb_secret_'

function decodeJwtRole(key: string): string | undefined {
  const payload = key.split('.')[1]
  if (!payload) return undefined
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const parsed: unknown = JSON.parse(json)
    if (parsed && typeof parsed === 'object' && 'role' in parsed) {
      return typeof parsed.role === 'string' ? parsed.role : undefined
    }
  } catch {
    // Not a JWT. Fine: new-style keys are opaque strings.
  }
  return undefined
}

/** True for keys that bypass RLS: `sb_secret_…` keys and legacy `service_role` JWTs. */
export function isPrivilegedSupabaseKey(key: string): boolean {
  return key.startsWith(SECRET_KEY_PREFIX) || decodeJwtRole(key) === 'service_role'
}

/**
 * Throws if `key` is a privileged key. Call this wherever a key is loaded for
 * a client-side (web or mobile) Supabase client.
 */
export function assertPublishableKey(key: string): void {
  if (isPrivilegedSupabaseKey(key)) {
    throw new Error(
      'Refusing to use a Supabase secret/service_role key in a client. ' +
        'Use the publishable (anon) key; secret keys belong on the server only.',
    )
  }
}
