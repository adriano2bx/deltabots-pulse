import type { MiddlewareHandler } from 'hono';
import type { OrgRole, Scope } from '@pulse/contracts';
import {
  GATEWAY_SCOPES,
  PulseError,
  USER_SESSION_SCOPES,
  fromBase64url,
  sha256Hex,
  type Principal,
} from '@pulse/core';
import type { AppEnv, Env } from '../env';
import { first, run } from './db';
import { verifyAccessToken } from './jwt';
import type { Ctx } from './http';

interface SessionRow {
  id: string;
  user_id: string;
  tenant_id: string;
  kind: string;
  gateway_id: string | null;
  mfa_verified: number;
  expires_at: string;
  revoked_at: string | null;
  last_seen_at: string | null;
  user_status: string;
  role: OrgRole | null;
}

export const API_KEY_PREFIX = 'pul_';

async function principalFromJwt(env: Env, token: string): Promise<Principal> {
  const claims = await verifyAccessToken(env, token);
  const s = await first<SessionRow>(
    env.DB,
    `SELECT s.id,s.user_id,s.tenant_id,s.kind,s.gateway_id,s.mfa_verified,s.expires_at,s.revoked_at,s.last_seen_at,
            u.status AS user_status, m.role AS role
       FROM sessions s JOIN users u ON u.id=s.user_id
       LEFT JOIN org_members m ON m.tenant_id=s.tenant_id AND m.user_id=s.user_id AND m.status='active'
      WHERE s.id=?`,
    claims.sid,
  );
  if (!s || s.user_id !== claims.sub || s.tenant_id !== claims.tid)
    throw new PulseError('AUTH_REQUIRED', 'sessão inexistente');
  if (s.revoked_at) throw new PulseError('AUTH_REQUIRED', 'sessão revogada');
  if (new Date(s.expires_at) <= new Date()) throw new PulseError('TOKEN_EXPIRED');
  if (s.user_status !== 'active') throw new PulseError('FORBIDDEN', 'conta inativa');
  if (!s.role) throw new PulseError('FORBIDDEN', 'sem vínculo ativo com a organização');
  const now = Date.now();
  if (!s.last_seen_at || now - new Date(s.last_seen_at).getTime() > 5 * 60_000) {
    await run(env.DB, 'UPDATE sessions SET last_seen_at=? WHERE id=?', new Date(now).toISOString(), s.id);
  }
  const scopes = new Set<Scope>(s.kind === 'gateway' ? GATEWAY_SCOPES : USER_SESSION_SCOPES);
  return {
    kind: s.kind === 'gateway' ? 'gateway' : 'user',
    userId: s.user_id,
    tenantId: s.tenant_id,
    orgRole: s.role,
    scopes,
    mfa: s.mfa_verified === 1,
    sessionId: s.id,
    gatewayId: s.gateway_id ?? undefined,
  };
}

async function principalFromApiKey(env: Env, token: string): Promise<Principal> {
  const hash = await sha256Hex(token);
  const k = await first<{
    id: string;
    tenant_id: string;
    owner_user_id: string;
    scopes_json: string;
    expires_at: string | null;
    revoked_at: string | null;
    role: OrgRole | null;
    last_used_at: string | null;
  }>(
    env.DB,
    `SELECT k.id,k.tenant_id,k.owner_user_id,k.scopes_json,k.expires_at,k.revoked_at,k.last_used_at,m.role
       FROM api_keys k LEFT JOIN org_members m ON m.tenant_id=k.tenant_id AND m.user_id=k.owner_user_id AND m.status='active'
      WHERE k.key_hash=?`,
    hash,
  );
  if (!k || k.revoked_at) throw new PulseError('AUTH_REQUIRED', 'chave de API inválida');
  if (k.expires_at && new Date(k.expires_at) <= new Date())
    throw new PulseError('TOKEN_EXPIRED', 'chave de API expirada');
  if (!k.role) throw new PulseError('FORBIDDEN', 'titular sem vínculo ativo');
  const now = Date.now();
  if (!k.last_used_at || now - new Date(k.last_used_at).getTime() > 5 * 60_000) {
    await run(env.DB, 'UPDATE api_keys SET last_used_at=? WHERE id=?', new Date(now).toISOString(), k.id);
  }
  return {
    kind: 'api_key',
    userId: k.owner_user_id,
    tenantId: k.tenant_id,
    orgRole: k.role,
    scopes: new Set(JSON.parse(k.scopes_json) as Scope[]),
    mfa: false,
    apiKeyId: k.id,
  };
}

export async function authenticate(env: Env, header: string | undefined): Promise<Principal> {
  if (!header || !header.startsWith('Bearer ')) throw new PulseError('AUTH_REQUIRED');
  const token = header.slice(7).trim();
  if (token.length < 20 || token.length > 4096) throw new PulseError('AUTH_REQUIRED', 'token inválido');
  return token.startsWith(API_KEY_PREFIX) ? principalFromApiKey(env, token) : principalFromJwt(env, token);
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('principal', await authenticate(c.env, c.req.header('authorization')));
  await next();
};

export function requireScope(p: Principal, scope: Scope): void {
  if (!p.scopes.has(scope)) throw new PulseError('FORBIDDEN', `escopo ${scope} necessário`);
}

export function requireHuman(p: Principal): void {
  if (p.kind === 'api_key') throw new PulseError('FORBIDDEN', 'operação exige sessão interativa');
}

export function requireMfa(p: Principal): void {
  if (!p.mfa) throw new PulseError('MFA_REQUIRED', 'operação privilegiada exige MFA');
}

function derToRaw(der: Uint8Array): Uint8Array {
  // SEQUENCE { INTEGER r, INTEGER s } → r||s (32 bytes cada)
  if (der[0] !== 0x30) throw new Error('assinatura DER inválida');
  let i = 2;
  const read = (): Uint8Array => {
    if (der[i] !== 0x02) throw new Error('assinatura DER inválida');
    const len = der[i + 1] as number;
    let v = der.slice(i + 2, i + 2 + len);
    i += 2 + len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = read();
  const s = read();
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

export const GATEWAY_PROOF_MAX_SKEW_MS = 5 * 60_000;

/**
 * Prova de posse do gateway (docs/03 fronteira 2): assinatura ECDSA P-256 da chave mantida no Keystore
 * sobre `METHOD\nPATH\nTIMESTAMP\nSHA256(body)`.
 */
export async function requireGateway(c: Ctx, bodyText: string): Promise<{ gatewayId: string }> {
  const p = c.get('principal');
  if (!p.gatewayId) throw new PulseError('FORBIDDEN', 'sessão não vinculada a um gateway');
  const gw = await first<{
    id: string;
    public_key: string | null;
    revoked_at: string | null;
    tenant_id: string;
  }>(c.env.DB, 'SELECT id,public_key,revoked_at,tenant_id FROM gateways WHERE id=?', p.gatewayId);
  if (!gw || gw.tenant_id !== p.tenantId) throw new PulseError('FORBIDDEN', 'gateway desconhecido');
  if (gw.revoked_at) throw new PulseError('FORBIDDEN', 'gateway revogado');
  if (gw.public_key) {
    const ts = c.req.header('x-pulse-timestamp');
    const sig = c.req.header('x-pulse-signature');
    if (!ts || !sig) throw new PulseError('FORBIDDEN', 'prova de posse do gateway ausente');
    const t = Date.parse(ts);
    if (Number.isNaN(t) || Math.abs(Date.now() - t) > GATEWAY_PROOF_MAX_SKEW_MS) {
      throw new PulseError('FORBIDDEN', 'carimbo de tempo fora da tolerância');
    }
    const url = new URL(c.req.url);
    const message = `${c.req.method}\n${url.pathname}\n${ts}\n${await sha256Hex(bodyText)}`;
    let ok = false;
    try {
      const key = await crypto.subtle.importKey(
        'spki',
        fromBase64url(gw.public_key) as BufferSource,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );
      let sigBytes = fromBase64url(sig);
      if (sigBytes.length !== 64) sigBytes = derToRaw(sigBytes);
      ok = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        sigBytes as BufferSource,
        new TextEncoder().encode(message),
      );
    } catch {
      ok = false;
    }
    if (!ok) throw new PulseError('FORBIDDEN', 'assinatura do gateway inválida');
  }
  return { gatewayId: gw.id };
}
