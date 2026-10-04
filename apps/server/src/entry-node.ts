// Local development server: `pnpm dev:server`.
import { serve } from '@hono/node-server'

import { createApp } from './api'
import { loadConfig } from './config'
import { createPageFetcher } from './lib/page-fetcher'
import { createWebPushSender } from './lib/web-push-sender'

const config = loadConfig(process.env)
const app = createApp(config, {
  pushSender: createWebPushSender(config),
  pageFetcher: createPageFetcher(),
})

// Loopback only: the dev API is never reachable from other machines on your network.
serve({ fetch: app.fetch, port: config.PORT, hostname: '127.0.0.1' }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`API ready on http://127.0.0.1:${info.port}`)
})
