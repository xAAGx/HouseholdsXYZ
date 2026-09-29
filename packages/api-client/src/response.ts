import { ApiError, isApiErrorBody } from '@households/shared'

/**
 * Unwraps a Hono RPC response: returns the typed JSON body on success and
 * throws an ApiError (with the server's code and user-safe message) otherwise.
 *
 *   const { households } = await unwrap(api.v1.households.$get())
 */
export async function unwrap<T>(
  request: Promise<{ ok: boolean; status: number; json(): Promise<T> }>,
): Promise<Exclude<T, { error: unknown }>> {
  const res = await request
  const body: unknown = await res.json().catch(() => undefined)
  if (!res.ok) {
    if (isApiErrorBody(body)) {
      throw new ApiError(body.error.code, body.error.message, body.error.issues)
    }
    throw new ApiError(res.status >= 500 ? 'INTERNAL' : 'BAD_REQUEST')
  }
  return body as Exclude<T, { error: unknown }>
}
