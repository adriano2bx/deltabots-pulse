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

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256HexText(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface TestGateway {
  id: string;
  keys: CryptoKeyPair;
  /** Requisição assinada com prova de posse (ECDSA P-256). */
  signed(path: string, method: string, json?: unknown, token?: string): Promise<Response>;
}

export async function registerGateway(u: TestUser): Promise<TestGateway> {
  const keys = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const spki = b64url((await crypto.subtle.exportKey('spki', keys.publicKey)) as ArrayBuffer);
  const res = await call('/gateways', {
    method: 'POST',
    token: u.access,
    json: { kind: 'android', display_name: 'Celular de teste', public_key: spki, app_version: '1.0.0' },
  });
  if (res.status !== 201) throw new Error(`gateway: ${res.status} ${await res.text()}`);
  const { data } = (await res.json()) as { data: { id: string } };
  return {
    id: data.id,
    keys,
    async signed(path, method, body, token = u.access) {
      const text = body === undefined ? '' : JSON.stringify(body);
      const ts = new Date().toISOString();
      const msg = `${method}\n/v1${path}\n${ts}\n${await sha256HexText(text)}`;
      const sig = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        keys.privateKey,
        new TextEncoder().encode(msg),
      );
      const headers: Record<string, string> = {
        'x-pulse-timestamp': ts,
        'x-pulse-signature': b64url(sig as ArrayBuffer),
      };
      return call(path, { method, token, headers, ...(body === undefined ? {} : { json: body }) });
    },
  };
}

export async function grantHealthConsents(u: TestUser): Promise<void> {
  for (const purpose of ['health_processing', 'cloud_sync_health']) {
    const r = await call('/consents', {
      method: 'POST',
      token: u.access,
      json: { purpose, policy_version: '2026-10' },
    });
    if (r.status !== 201) throw new Error('consent');
  }
}

export async function registerBand(
  u: TestUser,
  gw: TestGateway,
  fingerprint = `fp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
): Promise<string> {
  const r = await gw.signed('/devices', 'POST', {
    model: 'Mi Band 3',
    manufacturer: 'Xiaomi',
    firmware: 'V2.4.0.32',
    gateway_id: gw.id,
    hardware_fingerprint: fingerprint.padEnd(20, '0'),
  });
  if (r.status !== 201 && r.status !== 200) throw new Error(`device: ${r.status} ${await r.text()}`);
  return ((await r.json()) as { data: { id: string } }).data.id;
}
