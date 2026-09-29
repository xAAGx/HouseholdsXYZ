// @ts-check
import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/** Code that runs on users' devices (and therefore must never hold secrets). */
const CLIENT_CODE = ['apps/web/src/**', 'apps/mobile/**', 'packages/*/src/**']

const NO_RAW_HTML = {
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  message:
    'Rendering raw HTML enables XSS, which would expose sessions and household data. Render text, or get a security review for a sanitizer.',
}

// Design-system guardrails (DESIGN.md): UI code takes colors and fonts from the
// theme, so the brand can't drift one hard-coded value at a time.
const DESIGN_TOKENS_ONLY = [
  {
    selector: String.raw`TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(/]`,
    message: 'Use theme colors (theme.colors.*), not raw color values. See DESIGN.md → Color.',
  },
  {
    selector: String.raw`Literal[value=/^#[0-9a-fA-F]{3,8}$|^rgba?\(|^hsla?\(/]`,
    message: 'Use theme colors (theme.colors.*), not raw color values. See DESIGN.md → Color.',
  },
  {
    selector: String.raw`TemplateElement[value.raw=/font-family:\s*['"A-Za-z]/]`,
    message: 'Use theme.fonts.* (display, body, playful). See DESIGN.md → Typography.',
  },
]

export default defineConfig(
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/.vercel/',
    '**/.turbo/',
    '**/.expo/',
    '**/coverage/',
    'apps/mobile/android/',
    'apps/mobile/ios/',
    'supabase/',
    'packages/db/src/database.types.ts',
  ]),

  js.configs.recommended,

  // TypeScript, with type-aware rules (catches floating promises, unsafe any, …).
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },

  // Tests and tool configs are type-checked by tsc; skip type-aware linting for speed.
  {
    files: ['**/*.test.{ts,tsx}', '**/test/**/*.ts', '**/*.config.{ts,js}'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // ── Security rules (everywhere) ───────────────────────────────────────────
  {
    rules: {
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-console': 'warn',
      'no-restricted-syntax': ['error', NO_RAW_HTML],
    },
  },

  // ── Client code: no secrets, no server internals ──────────────────────────
  {
    files: CLIENT_CODE,
    ignores: ['packages/api-client/src/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@households/server', '@households/server/*'],
              message: 'Clients reach the API through @households/api-client.',
            },
          ],
        },
      ],
    },
  },

  // Shared packages run on web, server and mobile: keep them platform-neutral.
  {
    files: ['packages/*/src/**'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'process',
          message: 'Shared packages must not read the environment. Pass config in.',
        },
        { name: 'Buffer', message: 'Use Uint8Array / TextEncoder: Buffer is Node-only.' },
        { name: 'window', message: 'Shared packages must not assume a browser.' },
        { name: 'document', message: 'Shared packages must not assume a browser.' },
      ],
    },
  },

  // ── Web ───────────────────────────────────────────────────────────────────
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'Use import.meta.env (VITE_* values are public!).' },
      ],
      // Re-states NO_RAW_HTML: a later no-restricted-syntax replaces earlier ones.
      'no-restricted-syntax': ['error', NO_RAW_HTML, ...DESIGN_TOKENS_ONLY],
    },
  },

  // ── Mobile ────────────────────────────────────────────────────────────────
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
  },

  // ── Server & tooling ──────────────────────────────────────────────────────
  {
    files: [
      'apps/server/**/*.ts',
      '**/scripts/**/*.{ts,mjs}',
      '**/*.config.{ts,js}',
      'eslint.config.js',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/scripts/**/*.{ts,mjs}'],
    rules: { 'no-console': 'off' },
  },
)
