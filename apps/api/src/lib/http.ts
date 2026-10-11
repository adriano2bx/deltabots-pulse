import type { Context } from 'hono';
import type { z } from 'zod';
import { PulseError } from '@pulse/core';
import type { AppEnv } from '../env';

export type Ctx = Context<AppEnv>;

function fieldErrors(err: z.ZodError): Array<{ path: string; message: string }> {
  return err.issues.slice(0, 20).map((i) => ({ path: i.path.join('.') || '(raiz)', message: i.message }));
}

export async function parseBody<T extends z.ZodType>(c: Ctx, schema: T): Promise<z.infer<T>> {
  const ct = c.req.header('content-type') ?? '';
  if (!ct.includes('application/json'))
    throw new PulseError('VALIDATION_ERROR', 'Content-Type deve ser application/json');
  const len = Number(c.req.header('content-length') ?? '0');
  if (len > 256 * 1024) throw new PulseError('VALIDATION_ERROR', 'corpo excede 256 KiB');
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new PulseError('VALIDATION_ERROR', 'JSON malformado');
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new PulseError('VALIDATION_ERROR', 'Dados inválidos', fieldErrors(r.error));
  return r.data;
}

export function parseQuery<T extends z.ZodType>(c: Ctx, schema: T): z.infer<T> {
  const r = schema.safeParse(c.req.query());
  if (!r.success) throw new PulseError('VALIDATION_ERROR', 'Parâmetros inválidos', fieldErrors(r.error));
  return r.data;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function json(value: unknown): string {
  return JSON.stringify(value);
}

export function parseJsonColumn<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Cursor opaco baseado em (chave de ordenação, id). */
export function encodeCursor(sortKey: string, id: string): string {
  return btoa(`${sortKey}|${id}`).replace(/=+$/, '');
}

export function decodeCursor(cursor: string | undefined): { sortKey: string; id: string } | null {
  if (!cursor) return null;
  try {
    const [sortKey, id] = atob(cursor).split('|');
    if (!sortKey || !id) return null;
    return { sortKey, id };
  } catch {
    throw new PulseError('VALIDATION_ERROR', 'cursor inválido');
  }
}
