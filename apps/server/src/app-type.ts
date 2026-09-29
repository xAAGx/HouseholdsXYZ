// Type-only entry point consumed by @households/api-client (Hono RPC).
// Keep everything reachable from here free of Node-only globals such as
// `process` or `Buffer`: web and mobile type-check these files too.
import type { createApp } from './api'

export type AppType = ReturnType<typeof createApp>
