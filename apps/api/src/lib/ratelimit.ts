import { PulseError } from '@pulse/core';
import type { Env } from '../env';

interface Window {
  start: number;
  count: number;
}
const windows = new Map<string, Window>();

/**
 * Limite por chave. Em produção usa o binding Workers Rate Limiting (global por localidade);
 * sem ele (local/testes), usa janela fixa por isolate — melhor esforço, documentado.
 */
export async function rateLimit(env: Env, key: string, limit: number, windowMs: number): Promise<void> {
  if (env.RATE_LIMITER) {
    const { success } = await env.RATE_LIMITER.limit({ key });
    if (!success) throw new PulseError('RATE_LIMITED');
    return;
  }
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 10_000) windows.clear();
    return;
  }
  w.count += 1;
  if (w.count > limit) throw new PulseError('RATE_LIMITED');
}

export function resetRateLimits(): void {
  windows.clear();
}
