/**
 * Scrubs personal data and credentials before anything is logged or sent to
 * an error tracker. Logs are copied, retained and read by many people: treat
 * them as semi-public and keep household data out of them.
 */

const REDACTED = '[REDACTED]'
const MAX_DEPTH = 8

const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|session|api[-_]?key|private[-_]?key|otp|code_verifier|email|phone|address|birth|ssn|iban|card/i

const PATTERNS: [RegExp, string][] = [
  // JWTs (access/refresh tokens)
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[JWT]'],
  // Supabase keys
  [/\bsb_(secret|publishable)_[\w-]+/g, '[SUPABASE_KEY]'],
  // Bearer credentials in free text
  [/\bBearer\s+[\w.~+/=-]+/gi, 'Bearer [REDACTED]'],
  // Email addresses
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[EMAIL]'],
  // Phone numbers: international (+44 20 7946 0958) and 3-3-4 national formats.
  // Shaped so ISO dates and times are left alone.
  [/\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}/g, '[PHONE]'],
  [/\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[PHONE]'],
]

export function redactString(value: string): string {
  return PATTERNS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), value)
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]'
  if (typeof value === 'string') return redactString(value)
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1))
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) }
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(item, depth + 1)
    }
    return out
  }
  return value
}
