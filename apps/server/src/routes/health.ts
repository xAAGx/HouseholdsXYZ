import { Hono } from 'hono'

import type { AppEnv } from '../types'

// Liveness only. Deliberately reveals nothing: no version, commit, env, or dependency status.
export const healthRoutes = new Hono<AppEnv>().get('/', (c) => c.json({ status: 'ok' as const }))
