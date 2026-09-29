// Vercel Function entry. Bundled by scripts/build-vercel.ts into
// .vercel/output/functions/api.func (Vercel Build Output API v3).
import { getRequestListener } from '@hono/node-server'

import { createApp } from './api'
import { loadConfig } from './config'

const app = createApp(loadConfig(process.env))

export default getRequestListener(app.fetch)
