/**
 * Returns `candidate` only if it is a same-app path ("/app/settings"), else
 * `fallback`. Use it for every "return to" / deep-link parameter so an
 * attacker can't craft links that bounce users to their own site after sign-in
 * (open redirect → phishing).
 */
export function safeInternalPath(candidate: unknown, fallback = '/'): string {
  if (typeof candidate !== 'string' || candidate.length > 2048) return fallback
  // Must be root-relative, and not protocol-relative (//evil.com) or backslash tricks (/\evil.com).
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return fallback
  }
  // Reject control characters, which some browsers strip, turning "/\t/evil.com" into "//evil.com".
  for (const char of candidate) {
    const code = char.charCodeAt(0)
    if (code < 0x20 || code === 0x7f) return fallback
  }
  try {
    const url = new URL(candidate, 'https://internal.invalid')
    if (url.origin !== 'https://internal.invalid') return fallback
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}
