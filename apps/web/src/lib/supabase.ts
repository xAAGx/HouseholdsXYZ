import { createPublicClient } from '@households/db'

import { env } from './env'

/**
 * The browser's Supabase client. Uses the publishable key, so everything it
 * can read or write is decided by Row Level Security for the signed-in user.
 *
 * Sessions live in localStorage (supabase-js default for SPAs). That makes
 * XSS the main threat to accounts, which is why the app ships a strict CSP
 * (apps/web/vercel.json) and never renders untrusted HTML.
 */
export const supabase = createPublicClient({
  url: env.VITE_SUPABASE_URL,
  publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
  options: {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
})
