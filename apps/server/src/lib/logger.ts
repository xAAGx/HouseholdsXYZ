/* eslint-disable no-console -- this module is the one sanctioned place that writes to the console */
import { redact, redactString } from '@households/shared'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogFields = Record<string, unknown>

export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
}

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

/**
 * Structured JSON logs. Everything passes through `redact()`, so tokens,
 * emails and other personal data are scrubbed even if a caller slips up.
 * Still: never log request bodies, household content, or full URLs.
 */
export function createLogger(minLevel: LogLevel = 'info'): Logger {
  const write = (level: LogLevel, message: string, fields?: LogFields) => {
    if (LEVELS[level] < LEVELS[minLevel]) return
    const line = JSON.stringify({
      level,
      time: new Date().toISOString(),
      message: redactString(message),
      ...(fields ? (redact(fields) as LogFields) : {}),
    })
    if (level === 'error' || level === 'warn') console.error(line)
    else console.log(line)
  }
  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
  }
}
