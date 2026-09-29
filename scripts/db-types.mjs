// Regenerates packages/db/src/database.types.ts from the local Supabase database.
//
// The file is written only after generation succeeds, so a failed run (Docker
// not running, CLI missing, database down) can never wipe the existing types.
// A plain `supabase gen types … > file` redirect truncates the file first.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const target = 'packages/db/src/database.types.ts'
// On Windows the CLIs are .cmd shims, which need a shell. The arguments are
// fixed strings, so there is nothing to inject.
const shell = process.platform === 'win32'

let output
try {
  output = execFileSync(
    'supabase',
    ['gen', 'types', 'typescript', '--local', '--schema', 'public'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      shell,
    },
  )
} catch {
  console.error(
    `\nType generation failed, so ${target} was left unchanged.\n` +
      'Is the local database running? Start Docker, then run `pnpm db:start`.',
  )
  process.exit(1)
}

if (!output.includes('export type Database')) {
  console.error(`\nUnexpected output from supabase gen types; ${target} was left unchanged.`)
  process.exit(1)
}

writeFileSync(target, output)
execFileSync('prettier', ['--write', target], { stdio: 'inherit', shell })
console.log(`Updated ${target}`)
