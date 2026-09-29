/** Compile-time exhaustiveness check for switch statements over unions. */
export function assertNever(value: never, message = 'Unexpected value'): never {
  throw new Error(`${message}: ${String(value)}`)
}
