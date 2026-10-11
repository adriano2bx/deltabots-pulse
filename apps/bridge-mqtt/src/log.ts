import { redactObject, redact } from '@pulse/core';
import type { Logger } from './types';

/** Logs estruturados sem PII/segredos (docs/27). */
export const logger: Logger = {
  info: (msg, extra) =>
    console.warn(
      JSON.stringify({
        level: 'info',
        msg: redact(msg),
        ...(extra ? (redactObject(extra) as object) : {}),
        at: new Date().toISOString(),
      }),
    ),
  warn: (msg, extra) =>
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: redact(msg),
        ...(extra ? (redactObject(extra) as object) : {}),
        at: new Date().toISOString(),
      }),
    ),
  error: (msg, extra) =>
    console.error(
      JSON.stringify({
        level: 'error',
        msg: redact(msg),
        ...(extra ? (redactObject(extra) as object) : {}),
        at: new Date().toISOString(),
      }),
    ),
};
