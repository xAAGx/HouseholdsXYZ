/**
 * Serves the built Vercel function locally so you can test exactly what will be
 * deployed: `pnpm build && pnpm preview`. Loads apps/server/.env.
 */
import { createServer } from 'node:http'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

type NodeHandler = Parameters<typeof createServer>[1]

const bundle = join(import.meta.dirname, '../.vercel/output/functions/api.func/index.mjs')
const { default: handler } = (await import(pathToFileURL(bundle).href)) as { default: NodeHandler }

const port = Number(process.env.PORT ?? 8787)
createServer(handler).listen(port, '127.0.0.1', () => {
  console.log(`Preview of Vercel bundle on http://127.0.0.1:${port}`)
})
