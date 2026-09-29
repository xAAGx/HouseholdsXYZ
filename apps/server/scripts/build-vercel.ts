/**
 * Bundles the API into a single Vercel Function using the Build Output API v3:
 *
 *   .vercel/output/
 *     config.json                  every path → /api
 *     functions/api.func/
 *       index.mjs                  entry-vercel.ts + all workspace packages & deps
 *       .vc-config.json            Node.js runtime config
 *
 * Why not Vercel's zero-config Hono detection? Our workspace packages ship as
 * TypeScript source. Bundling them ourselves makes the deploy artifact explicit,
 * reproducible, and testable locally (`pnpm build && pnpm preview`).
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { build } from 'esbuild'

const root = join(import.meta.dirname, '..')
const outputDir = join(root, '.vercel/output')
const functionDir = join(outputDir, 'functions/api.func')

// Vercel runs the build on the Node version configured for the project, so
// targeting the build's own major keeps runtime and bundle in lockstep.
const nodeMajor = process.versions.node.split('.')[0]

await rm(outputDir, { recursive: true, force: true })
await mkdir(functionDir, { recursive: true })

await build({
  absWorkingDir: root,
  entryPoints: ['src/entry-vercel.ts'],
  outfile: join(functionDir, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: `node${nodeMajor}`,
  // Source maps stay inside the function; they are never served publicly.
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
  // Some dependencies still use require(); give ESM output a working one.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
})

await writeFile(
  join(functionDir, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: `nodejs${nodeMajor}.x`,
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      shouldAddSourcemapSupport: true,
      supportsResponseStreaming: true,
      maxDuration: 30,
    },
    null,
    2,
  ),
)

await writeFile(
  join(outputDir, 'config.json'),
  JSON.stringify({ version: 3, routes: [{ src: '/(.*)', dest: '/api' }] }, null, 2),
)

console.log(`✓ Vercel output written to ${outputDir} (nodejs${nodeMajor}.x)`)
