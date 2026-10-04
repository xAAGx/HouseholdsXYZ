// Vercel Function entry. Bundled by scripts/build-vercel.ts into
// .vercel/output/functions/api.func (Vercel Build Output API v3).
import { getRequestListener } from '@hono/node-server'

import { createApp } from './api'
import { loadConfig } from './config'
import { createPageFetcher } from './lib/page-fetcher'
import { createWebPushSender } from './lib/web-push-sender'

const config = loadConfig(process.env)
const app = createApp(config, {
  pushSender: createWebPushSender(config),
  pageFetcher: createPageFetcher(),
})

export default getRequestListener(app.fetch)
