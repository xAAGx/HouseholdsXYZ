import { isPrivilegedSupabaseKey } from '@households/db'
import { z } from 'zod'

const originList = z.string().transform((value, ctx) => {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  for (const origin of origins) {
    let parsed: URL | undefined
    try {
      parsed = new URL(origin)
    } catch {
      // handled below
    }
    if (!parsed || parsed.origin !== origin) {
      ctx.addIssue({
        code: 'custom',
        message: `"${origin}" must be an exact origin like https://households.xyz (no wildcards, paths or trailing slash)`,
      })
      return z.NEVER
    }
  }
  return origins
})

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined)

const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    SUPABASE_URL: z.url(),
    SUPABASE_PUBLISHABLE_KEY: z
      .string()
      .min(20)
      .refine(
        (key) => !isPrivilegedSupabaseKey(key),
        'is a secret/service_role key. User requests must go through RLS: use the publishable key.',
      ),
    // Bypasses RLS. Used only by lib/admin-auth.ts (child logins, deleting
    // your own account); without it, those features are switched off.
    SUPABASE_SECRET_KEY: z
      .string()
      .optional()
      .transform((key) => key || undefined)
      .refine(
        (key) => key === undefined || isPrivilegedSupabaseKey(key),
        'must be the project secret key (sb_secret_…), or left unset',
      ),
    CORS_ALLOWED_ORIGINS: originList,
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    // Push notifications (all four, or none: push is then switched off).
    // VAPID keys identify this server to browsers' push services; generate a
    // pair with `pnpm --filter @households/server exec web-push generate-vapid-keys`.
    VAPID_PUBLIC_KEY: optionalSecret.refine(
      (key) => key === undefined || /^[A-Za-z0-9_-]{80,100}$/.test(key),
      'must be a base64url VAPID public key',
    ),
    VAPID_PRIVATE_KEY: optionalSecret.refine(
      (key) => key === undefined || /^[A-Za-z0-9_-]{40,50}$/.test(key),
      'must be a base64url VAPID private key',
    ),
    // Who push services can contact about this server: mailto: or https: URL.
    VAPID_SUBJECT: optionalSecret.refine(
      (value) => value === undefined || /^(mailto:\S+@\S+|https:\/\/\S+)$/.test(value),
      'must be a mailto: or https: URL',
    ),
    // 32 random bytes, base64: seals push subscriptions so the database can't
    // read them. Generate with `openssl rand -base64 32`.
    PUSH_SEAL_KEY: optionalSecret.refine(
      (key) => key === undefined || /^[A-Za-z0-9+/]{43}=$/.test(key),
      'must be 32 bytes, base64 (openssl rand -base64 32)',
    ),
    // Shared with Supabase Vault (households_push_secret): the database's timer
    // signs reminder pushes with it. Unset: reminders stay in-app only.
    INTERNAL_PUSH_SECRET: optionalSecret.refine(
      (key) => key === undefined || key.length >= 32,
      'must be at least 32 characters (openssl rand -hex 32)',
    ),
  })
  .superRefine((env, ctx) => {
    const push = [env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT, env.PUSH_SEAL_KEY]
    if (push.some(Boolean) && !push.every(Boolean)) {
      ctx.addIssue({
        code: 'custom',
        path: ['VAPID_PUBLIC_KEY'],
        message:
          'set all of VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT and PUSH_SEAL_KEY, or none',
      })
    }
    if (env.NODE_ENV === 'production') {
      if (!env.SUPABASE_URL.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: ['SUPABASE_URL'],
          message: 'must use https in production',
        })
      }
      for (const origin of env.CORS_ALLOWED_ORIGINS) {
        if (!origin.startsWith('https://')) {
          ctx.addIssue({
            code: 'custom',
            path: ['CORS_ALLOWED_ORIGINS'],
            message: `"${origin}" must use https in production`,
          })
        }
      }
    }
  })

export type AppConfig = Readonly<z.output<typeof configSchema>>

/**
 * Validates configuration once at startup and fails fast. Error messages name
 * the variables and the problem, never their values.
 */
export function loadConfig(source: Record<string, string | undefined>): AppConfig {
  const result = configSchema.safeParse(source)
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.map(String).join('.') || '(config)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid server configuration:\n${problems}`)
  }
  return Object.freeze(result.data)
}
