import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/** Mirrors isPrivilegedSupabaseKey() from @households/db (kept inline so config loading stays dependency-free). */
function looksLikeSecret(value: string): boolean {
  if (value.startsWith('sb_secret_')) return true
  const payload = value.split('.')[1]
  if (!payload) return false
  try {
    return Buffer.from(payload, 'base64url').toString('utf8').includes('"service_role"')
  } catch {
    return false
  }
}

/**
 * Every VITE_* variable is compiled into the public JavaScript bundle. Fail the
 * dev server and the build if one of them holds a secret key.
 */
function forbidSecretsInClientEnv(): Plugin {
  return {
    name: 'households:forbid-secrets-in-client-env',
    config(_config, { mode }) {
      const env = loadEnv(mode, process.cwd(), 'VITE_')
      for (const [name, value] of Object.entries(env)) {
        if (looksLikeSecret(value)) {
          throw new Error(
            `${name} contains a secret/service_role key. VITE_* values are public; ` +
              'secret keys belong on the server only.',
          )
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [forbidSecretsInClientEnv(), react()],
  // Fixed, non-default ports: the API's CORS allowlist and Supabase auth redirects
  // point here, so we fail loudly on a clash instead of silently moving ports.
  // (5173 is Vite's default and often taken by other projects.)
  server: {
    port: 5180,
    strictPort: true,
  },
  preview: {
    port: 4180,
    strictPort: true,
  },
  build: {
    // Don't publish source maps: they expose our full source to anyone.
    sourcemap: false,
  },
})
