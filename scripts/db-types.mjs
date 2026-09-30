// Regenerates packages/db/src/database.types.ts from the linked Supabase
// project (`pnpm supabase link`), so run it after `pnpm db:push`.
//
// The file is written only after generation succeeds, so a failed run (no
// token, not linked, offline) can never wipe the existing types. A plain
// `supabase gen types … > file` redirect truncates the file first.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

import { supabase } from './supabase.mjs'

const target = 'packages/db/src/database.types.ts'

const result = supabase(['gen', 'types', 'typescript', '--linked', '--schema', 'public'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
})
const output = result.stdout ?? ''

if (result.status !== 0) {
  console.error(
    `\nType generation failed, so ${target} was left unchanged.\n` +
      'Is SUPABASE_ACCESS_TOKEN set in the root .env, and the project linked\n' +
      '(`pnpm supabase link --project-ref <ref>`)?',
  )
  process.exit(1)
}

if (!output.includes('export type Database')) {
  console.error(`\nUnexpected output from supabase gen types; ${target} was left unchanged.`)
  process.exit(1)
}

writeFileSync(target, output)
// On Windows prettier is a .cmd shim, which needs a shell. The arguments are
// fixed strings, so there is nothing to inject.
execFileSync('prettier', ['--write', target], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
console.log(`Updated ${target}`)
