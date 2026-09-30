// Runs the Supabase CLI with the git-ignored root .env loaded, so a personal
// access token in SUPABASE_ACCESS_TOKEN works without `supabase login`:
//
//   pnpm supabase link --project-ref <ref>
//   pnpm db:push / pnpm db:types / pnpm db:lint
//
// Only these scripts read the root .env; the apps never do (they have their
// own apps/*/.env), so the token can't end up in a bundle or a deployment.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = join(import.meta.dirname, '..')
const cli = join(
  dirname(createRequire(import.meta.url).resolve('supabase/package.json')),
  'dist/supabase.js',
)

/** Runs the CLI through Node, without a shell, so arguments pass through untouched. */
export function supabase(args, options = {}) {
  const envFile = join(root, '.env')
  if (existsSync(envFile)) process.loadEnvFile(envFile)
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, stdio: 'inherit', ...options })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = supabase(process.argv.slice(2))
  process.exit(result.status ?? 1)
}
