import { assertPublishableKey } from '@households/db'
import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  VITE_API_URL: z.url(),
})

const parsed = envSchema.safeParse(import.meta.env)
if (!parsed.success) {
  const names = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
  throw new Error(
    `Missing or invalid environment variables: ${names}. Copy apps/web/.env.example to apps/web/.env.`,
  )
}

assertPublishableKey(parsed.data.VITE_SUPABASE_PUBLISHABLE_KEY)

export const env = Object.freeze(parsed.data)
