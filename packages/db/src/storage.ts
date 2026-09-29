/**
 * Storage conventions. All buckets are private: files are served through
 * short-lived signed URLs, never public links. Every household object lives
 * under `<householdId>/…` so storage RLS policies can authorize by the first
 * path segment.
 */

export const STORAGE_BUCKETS = {
  householdMedia: 'household-media',
  householdDocuments: 'household-documents',
  avatars: 'avatars',
} as const

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/** Seconds a signed download URL stays valid. Keep short: links get forwarded. */
export const SIGNED_URL_TTL_SECONDS = 60 * 5

/**
 * Builds `<householdId>/<segment>/…`, rejecting anything that could escape the
 * household's folder (`..`, slashes, empty or odd segments).
 */
export function householdObjectPath(householdId: string, ...segments: string[]): string {
  if (!UUID_RE.test(householdId)) throw new Error('Invalid household id for storage path')
  for (const segment of segments) {
    if (!SEGMENT_RE.test(segment) || segment.includes('..')) {
      throw new Error('Invalid storage path segment')
    }
  }
  return [householdId.toLowerCase(), ...segments].join('/')
}
