import { SELF } from 'cloudflare:test';

let counter = 0;

export async function call(
  path: string,
  init: RequestInit & { token?: string; json?: unknown } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.json);
  }
  return SELF.fetch(`https://api.test/v1${path}`, { ...init, headers, body });
}

export interface TestUser {
  email: string;
  password: string;
  access: string;
  refresh: string;
  userId: string;
  tenantId: string;
  sessionId: string;
}

export async function registerUser(name = 'Pessoa Teste'): Promise<TestUser> {
  counter += 1;
  const email = `user${Date.now()}_${counter}@example.test`;
  const password = 'senha-forte-123';
  const res = await call('/auth/register', {
    method: 'POST',
    headers: { 'cf-connecting-ip': `198.51.100.${counter % 250}` },
    json: {
      email,
      password,
      display_name: name,
      accepted_terms_version: '2026-10',
      timezone: 'America/Sao_Paulo',
    },
  });
  if (res.status !== 201) throw new Error(`registro falhou: ${res.status} ${await res.text()}`);
  const t = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    tenant_id: string;
    session_id: string;
  };
  const me = (await (await call('/me', { token: t.access_token })).json()) as { data: { id: string } };
  return {
    email,
    password,
    access: t.access_token,
    refresh: t.refresh_token,
    userId: me.data.id,
    tenantId: t.tenant_id,
    sessionId: t.session_id,
  };
}

export async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
