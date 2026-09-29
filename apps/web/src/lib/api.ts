import { createApiClient } from '@households/api-client'

import { env } from './env'
import { supabase } from './supabase'

/** Typed client for apps/server. `api.v1.households.$get()` etc. */
export const api = createApiClient({
  baseUrl: env.VITE_API_URL,
  getAccessToken: async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  },
})
