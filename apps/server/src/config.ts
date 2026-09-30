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
  })
  .superRefine((env, ctx) => {
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
