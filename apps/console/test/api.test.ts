import { describe, expect, it } from 'vitest';
import { ApiError, PulseClient } from '../src/lib/api';

function store() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

function fakeFetch(handler: (url: string, init: RequestInit) => { status: number; body?: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = handler(url, init);
    return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('PulseClient', () => {
  it('login guarda refresh e envia bearer nas chamadas seguintes', async () => {
    const { f, calls } = fakeFetch((url) =>
      url.endsWith('/auth/login')
        ? { status: 200, body: { access_token: 'A1', expires_in: 900, refresh_token: 'R1' } }
        : { status: 200, body: { data: [], next_cursor: null } },
    );
    const s = store();
    const c = new PulseClient('https://api.test', s, f);
    await c.login('a@b.c', 'senha-bem-longa-123');
    expect(s.getItem('pulse.refresh')).toBe('R1');
    await c.request('GET', '/devices', undefined, { scope: 'org' });
    const last = calls.at(-1)!;
    expect(last.url).toBe('https://api.test/v1/devices?scope=org');
    expect((last.init.headers as Record<string, string>).authorization).toBe('Bearer A1');
  });

  it('renova o token perto de expirar e rotaciona o refresh', async () => {
    let t = 0;
    const { f, calls } = fakeFetch((url) => {
      if (url.endsWith('/auth/login')) return { status: 200, body: { access_token: 'A1', expires_in: 100, refresh_token: 'R1' } };
      if (url.endsWith('/auth/refresh')) return { status: 200, body: { access_token: 'A2', expires_in: 900, refresh_token: 'R2' } };
      return { status: 200, body: { data: [] } };
    });
    const s = store();
    const c = new PulseClient('https://api.test', s, f, () => t);
    await c.login('a@b.c', 'x'.repeat(12));
    t = 50_000; // restam 50 s (< 60 s)
    await c.request('GET', '/consents');
    expect(calls.some((x) => x.url.endsWith('/auth/refresh'))).toBe(true);
    expect(s.getItem('pulse.refresh')).toBe('R2');
  });

  it('refresh concorrente é deduplicado', async () => {
    const { f, calls } = fakeFetch((url) =>
      url.endsWith('/auth/refresh') ? { status: 200, body: { access_token: 'A', expires_in: 900, refresh_token: 'R9' } } : { status: 200, body: { data: [] } },
    );
    const s = store();
    s.setItem('pulse.refresh', 'R0');
    const c = new PulseClient('https://api.test', s, f);
    await Promise.all([c.request('GET', '/a'), c.request('GET', '/b'), c.request('GET', '/c')]);
    expect(calls.filter((x) => x.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('refresh recusado limpa a sessão e propaga o erro', async () => {
    const { f } = fakeFetch(() => ({ status: 401, body: { code: 'AUTH_REQUIRED', detail: 'refresh inválido', trace_id: 't1' } }));
    const s = store();
    s.setItem('pulse.refresh', 'old');
    const c = new PulseClient('https://api.test', s, f);
    await expect(c.request('GET', '/me')).rejects.toMatchObject({ status: 401, code: 'AUTH_REQUIRED', traceId: 't1' });
    expect(s.getItem('pulse.refresh')).toBeNull();
    expect(c.signedIn).toBe(false);
  });

  it('mapeia o problema da API em ApiError', async () => {
    const { f } = fakeFetch((url) =>
      url.endsWith('/auth/login') ? { status: 403, body: { code: 'MFA_REQUIRED', detail: 'informe o código' } } : { status: 200 },
    );
    const c = new PulseClient('https://api.test', store(), f);
    const err = await c.login('a@b.c', 'x'.repeat(12)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('MFA_REQUIRED');
  });
});
