import { Hono } from 'hono';
import { z } from 'zod';
import { LoginRequest, MfaVerifyRequest, Password, RefreshRequest, RegisterRequest } from '@pulse/contracts';
import { PulseError, newId, randomToken, sha256Hex } from '@pulse/core';
import type { AppEnv, Env } from '../env';
import { audit } from '../lib/audit';
import { requireAuth } from '../lib/auth';
import { decrypt, encrypt } from '../lib/crypto';
import { all, first, run, stmt } from '../lib/db';
import { parseBody } from '../lib/http';
import { signAccessToken } from '../lib/jwt';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../lib/password';
import { rateLimit } from '../lib/ratelimit';
import { newTotpSecret, otpauthUri, verifyTotp } from '../lib/totp';

export const authRoutes = new Hono<AppEnv>();

const MAX_FAILED = 10;
const LOCK_MS = 15 * 60_000;

function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') ?? 'local';
}

async function issueSession(
  env: Env,
  opts: {
    userId: string;
    tenantId: string;
    mfaVerified: boolean;
    deviceLabel?: string | null;
    kind?: 'user' | 'gateway';
  },
) {
  const refresh = `rt_${randomToken(32)}`;
  const sessionId = newId('ses');
  const now = new Date();
  const ttl = Number(env.REFRESH_TOKEN_TTL_S || '2592000');
  await run(
    env.DB,
    `INSERT INTO sessions(id,user_id,tenant_id,refresh_hash,expires_at,created_at,last_seen_at,device_label,kind,mfa_verified)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
    sessionId,
    opts.userId,
    opts.tenantId,
    await sha256Hex(refresh),
    new Date(now.getTime() + ttl * 1000).toISOString(),
    now.toISOString(),
    now.toISOString(),
    opts.deviceLabel ?? null,
    opts.kind ?? 'user',
    opts.mfaVerified ? 1 : 0,
  );
  const at = await signAccessToken(env, {
    sub: opts.userId,
    tid: opts.tenantId,
    sid: sessionId,
    mfa: opts.mfaVerified,
  });
  return {
    access_token: at.token,
    expires_in: at.expiresIn,
    refresh_token: refresh,
    token_type: 'Bearer' as const,
    session_id: sessionId,
    tenant_id: opts.tenantId,
  };
}

async function defaultTenant(db: D1Database, userId: string): Promise<string> {
  const m = await first<{ tenant_id: string }>(
    db,
    `SELECT tenant_id FROM org_members WHERE user_id=? AND status='active' ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, created_at LIMIT 1`,
    userId,
  );
  if (!m) throw new PulseError('FORBIDDEN', 'usuário sem organização ativa');
  return m.tenant_id;
}

authRoutes.post('/register', async (c) => {
  await rateLimit(c.env, `register:${clientIp(c.req.raw)}`, 10, 3600_000);
  const body = await parseBody(c, RegisterRequest);
  const email = body.email.trim().toLowerCase();
  const exists = await first<{ id: string }>(c.env.DB, 'SELECT id FROM users WHERE email=?', email);
  if (exists) throw new PulseError('CONFLICT', 'não foi possível criar a conta com este e-mail');
  const now = new Date().toISOString();
  const userId = newId('usr');
  const tenantId = newId('ten');
  await c.env.DB.batch([
    stmt(
      c.env.DB,
      `INSERT INTO users(id,email,display_name,locale,timezone,status,created_at,updated_at,terms_version) VALUES(?,?,?,?,?,'active',?,?,?)`,
      userId,
      email,
      body.display_name ?? null,
      body.locale,
      body.timezone,
      now,
      now,
      body.accepted_terms_version,
    ),
    stmt(
      c.env.DB,
      `INSERT INTO user_credentials(user_id,password_hash,updated_at) VALUES(?,?,?)`,
      userId,
      await hashPassword(body.password),
      now,
    ),
    stmt(
      c.env.DB,
      `INSERT INTO organizations(id,name,plan_id,status,created_by,created_at,updated_at) VALUES(?,?, 'personal','active',?,?,?)`,
      tenantId,
      body.display_name ? `${body.display_name} (pessoal)` : 'Pessoal',
      userId,
      now,
      now,
    ),
    stmt(
      c.env.DB,
      `INSERT INTO org_members(id,tenant_id,user_id,role,status,created_at) VALUES(?,?,?,'owner','active',?)`,
      newId('mem'),
      tenantId,
      userId,
      now,
    ),
  ]);
  await audit(c.env.DB, {
    tenantId,
    actor: `user:${userId}`,
    action: 'auth.register',
    resourceType: 'user',
    resourceId: userId,
    metadata: { terms: body.accepted_terms_version },
  });
  const tokens = await issueSession(c.env, { userId, tenantId, mfaVerified: false, deviceLabel: null });
  return c.json(tokens, 201);
});

authRoutes.post('/login', async (c) => {
  const body = await parseBody(c, LoginRequest);
  const email = body.email.trim().toLowerCase();
  await rateLimit(c.env, `login-ip:${clientIp(c.req.raw)}`, 30, 600_000);
  await rateLimit(c.env, `login-email:${await sha256Hex(email)}`, 10, 600_000);
  const u = await first<{
    id: string;
    status: string;
    password_hash: string | null;
    mfa_enabled: number;
    mfa_secret_enc: string | null;
    failed_attempts: number;
    locked_until: string | null;
  }>(
    c.env.DB,
    `SELECT u.id,u.status,c.password_hash,c.mfa_enabled,c.mfa_secret_enc,c.failed_attempts,c.locked_until
       FROM users u JOIN user_credentials c ON c.user_id=u.id WHERE u.email=?`,
    email,
  );
  const valid = await verifyPassword(body.password, u?.password_hash ?? DUMMY_HASH);
  if (!u || u.status !== 'active') throw new PulseError('AUTH_REQUIRED', 'credenciais inválidas');
  if (u.locked_until && new Date(u.locked_until) > new Date())
    throw new PulseError('RATE_LIMITED', 'conta temporariamente bloqueada por tentativas');
  if (!valid) {
    const attempts = u.failed_attempts + 1;
    const lock = attempts >= MAX_FAILED ? new Date(Date.now() + LOCK_MS).toISOString() : null;
    await run(
      c.env.DB,
      'UPDATE user_credentials SET failed_attempts=?, locked_until=? WHERE user_id=?',
      lock ? 0 : attempts,
      lock,
      u.id,
    );
    await audit(c.env.DB, {
      tenantId: null,
      actor: `user:${u.id}`,
      action: 'auth.login_failed',
      resourceType: 'user',
      resourceId: u.id,
      reasonCode: lock ? 'locked' : 'bad_password',
    });
    throw new PulseError('AUTH_REQUIRED', 'credenciais inválidas');
  }
  let mfaVerified = false;
  if (u.mfa_enabled === 1) {
    if (!body.mfa_code) throw new PulseError('MFA_REQUIRED', 'informe o código do autenticador');
    const secret = await decrypt(c.env.DATA_ENCRYPTION_KEY, u.mfa_secret_enc as string);
    if (!(await verifyTotp(secret, body.mfa_code, Date.now()))) {
      await audit(c.env.DB, {
        tenantId: null,
        actor: `user:${u.id}`,
        action: 'auth.mfa_failed',
        resourceType: 'user',
        resourceId: u.id,
      });
      throw new PulseError('AUTH_REQUIRED', 'código inválido');
    }
    mfaVerified = true;
  }
  await run(
    c.env.DB,
    'UPDATE user_credentials SET failed_attempts=0, locked_until=NULL WHERE user_id=?',
    u.id,
  );
  const tenantId = await defaultTenant(c.env.DB, u.id);
  const tokens = await issueSession(c.env, {
    userId: u.id,
    tenantId,
    mfaVerified,
    deviceLabel: body.device_label ?? null,
  });
  await audit(c.env.DB, {
    tenantId,
    actor: `user:${u.id}`,
    action: 'auth.login',
    resourceType: 'session',
    resourceId: tokens.session_id,
    metadata: { mfa: mfaVerified },
  });
  return c.json(tokens);
});

authRoutes.post('/refresh', async (c) => {
  const body = await parseBody(c, RefreshRequest);
  await rateLimit(c.env, `refresh:${clientIp(c.req.raw)}`, 120, 600_000);
  const hash = await sha256Hex(body.refresh_token);
  const s = await first<{
    id: string;
    user_id: string;
    tenant_id: string;
    expires_at: string;
    revoked_at: string | null;
    mfa_verified: number;
    refresh_hash: string;
  }>(
    c.env.DB,
    'SELECT id,user_id,tenant_id,expires_at,revoked_at,mfa_verified,refresh_hash FROM sessions WHERE refresh_hash=? OR previous_refresh_hash=?',
    hash,
    hash,
  );
  if (!s || s.revoked_at) throw new PulseError('AUTH_REQUIRED', 'refresh inválido');
  if (s.refresh_hash !== hash) {
    // Reuso de refresh token já rotacionado → possível roubo: revoga a sessão inteira (F127/F128).
    await run(c.env.DB, 'UPDATE sessions SET revoked_at=? WHERE id=?', new Date().toISOString(), s.id);
    await audit(c.env.DB, {
      tenantId: s.tenant_id,
      actor: `user:${s.user_id}`,
      action: 'auth.refresh_reuse_detected',
      resourceType: 'session',
      resourceId: s.id,
      reasonCode: 'token_reuse',
    });
    throw new PulseError('AUTH_REQUIRED', 'sessão encerrada por segurança');
  }
  if (new Date(s.expires_at) <= new Date()) throw new PulseError('TOKEN_EXPIRED');
  const next = `rt_${randomToken(32)}`;
  await run(
    c.env.DB,
    'UPDATE sessions SET previous_refresh_hash=refresh_hash, refresh_hash=?, last_seen_at=? WHERE id=? AND refresh_hash=?',
    await sha256Hex(next),
    new Date().toISOString(),
    s.id,
    hash,
  );
  const at = await signAccessToken(c.env, {
    sub: s.user_id,
    tid: s.tenant_id,
    sid: s.id,
    mfa: s.mfa_verified === 1,
  });
  return c.json({
    access_token: at.token,
    expires_in: at.expiresIn,
    refresh_token: next,
    token_type: 'Bearer',
    session_id: s.id,
    tenant_id: s.tenant_id,
  });
});

authRoutes.post('/logout', requireAuth, async (c) => {
  const p = c.get('principal');
  if (p.sessionId) {
    await run(
      c.env.DB,
      'UPDATE sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL',
      new Date().toISOString(),
      p.sessionId,
    );
    await audit(c.env.DB, {
      tenantId: p.tenantId,
      actor: p,
      action: 'auth.logout',
      resourceType: 'session',
      resourceId: p.sessionId,
    });
  }
  return c.json({ data: { revoked: true } });
});

authRoutes.post('/switch-tenant', requireAuth, async (c) => {
  const p = c.get('principal');
  if (p.kind !== 'user') throw new PulseError('FORBIDDEN', 'somente sessões de usuário');
  const { tenant_id } = await parseBody(c, z.strictObject({ tenant_id: z.string().min(5).max(100) }));
  const m = await first<{ id: string }>(
    c.env.DB,
    `SELECT id FROM org_members WHERE tenant_id=? AND user_id=? AND status='active'`,
    tenant_id,
    p.userId,
  );
  if (!m) throw new PulseError('TENANT_MISMATCH');
  if (p.sessionId)
    await run(c.env.DB, 'UPDATE sessions SET revoked_at=? WHERE id=?', new Date().toISOString(), p.sessionId);
  const tokens = await issueSession(c.env, { userId: p.userId, tenantId: tenant_id, mfaVerified: p.mfa });
  await audit(c.env.DB, {
    tenantId: tenant_id,
    actor: p,
    action: 'auth.switch_tenant',
    resourceType: 'session',
    resourceId: tokens.session_id,
  });
  return c.json(tokens);
});

authRoutes.post('/mfa/setup', requireAuth, async (c) => {
  const p = c.get('principal');
  if (p.kind !== 'user') throw new PulseError('FORBIDDEN', 'somente sessões de usuário');
  const cred = await first<{ mfa_enabled: number }>(
    c.env.DB,
    'SELECT mfa_enabled FROM user_credentials WHERE user_id=?',
    p.userId,
  );
  if (cred?.mfa_enabled === 1) throw new PulseError('CONFLICT', 'MFA já ativo');
  const u = await first<{ email: string }>(c.env.DB, 'SELECT email FROM users WHERE id=?', p.userId);
  const secret = newTotpSecret();
  await run(
    c.env.DB,
    'UPDATE user_credentials SET mfa_secret_enc=?, updated_at=? WHERE user_id=?',
    await encrypt(c.env.DATA_ENCRYPTION_KEY, secret),
    new Date().toISOString(),
    p.userId,
  );
  return c.json({ data: { otpauth_uri: otpauthUri(secret, u?.email ?? p.userId), secret_base32: secret } });
});

async function checkUserTotp(env: Env, userId: string, code: string): Promise<boolean> {
  const cred = await first<{ mfa_secret_enc: string | null }>(
    env.DB,
    'SELECT mfa_secret_enc FROM user_credentials WHERE user_id=?',
    userId,
  );
  if (!cred?.mfa_secret_enc) return false;
  return verifyTotp(await decrypt(env.DATA_ENCRYPTION_KEY, cred.mfa_secret_enc), code, Date.now());
}

authRoutes.post('/mfa/verify', requireAuth, async (c) => {
  const p = c.get('principal');
  const { code } = await parseBody(c, MfaVerifyRequest);
  await rateLimit(c.env, `mfa:${p.userId}`, 10, 600_000);
  if (!(await checkUserTotp(c.env, p.userId, code))) throw new PulseError('AUTH_REQUIRED', 'código inválido');
  await run(
    c.env.DB,
    'UPDATE user_credentials SET mfa_enabled=1, updated_at=? WHERE user_id=?',
    new Date().toISOString(),
    p.userId,
  );
  if (p.sessionId) await run(c.env.DB, 'UPDATE sessions SET mfa_verified=1 WHERE id=?', p.sessionId);
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'auth.mfa_enabled',
    resourceType: 'user',
    resourceId: p.userId,
  });
  return c.json({ data: { mfa_enabled: true } });
});

/** Step-up: eleva a sessão atual após desafio TOTP. */
authRoutes.post('/mfa/challenge', requireAuth, async (c) => {
  const p = c.get('principal');
  const { code } = await parseBody(c, MfaVerifyRequest);
  await rateLimit(c.env, `mfa:${p.userId}`, 10, 600_000);
  if (!(await checkUserTotp(c.env, p.userId, code))) throw new PulseError('AUTH_REQUIRED', 'código inválido');
  if (p.sessionId) await run(c.env.DB, 'UPDATE sessions SET mfa_verified=1 WHERE id=?', p.sessionId);
  const at = await signAccessToken(c.env, {
    sub: p.userId,
    tid: p.tenantId,
    sid: p.sessionId as string,
    mfa: true,
  });
  return c.json({
    access_token: at.token,
    expires_in: at.expiresIn,
    token_type: 'Bearer',
    session_id: p.sessionId,
    tenant_id: p.tenantId,
  });
});

authRoutes.post('/mfa/disable', requireAuth, async (c) => {
  const p = c.get('principal');
  const { code } = await parseBody(c, MfaVerifyRequest);
  if (!(await checkUserTotp(c.env, p.userId, code))) throw new PulseError('AUTH_REQUIRED', 'código inválido');
  await run(
    c.env.DB,
    'UPDATE user_credentials SET mfa_enabled=0, mfa_secret_enc=NULL, updated_at=? WHERE user_id=?',
    new Date().toISOString(),
    p.userId,
  );
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'auth.mfa_disabled',
    resourceType: 'user',
    resourceId: p.userId,
  });
  return c.json({ data: { mfa_enabled: false } });
});

/** Sempre 202, exista ou não a conta (sem enumeração). Entrega por e-mail via provedor configurado. */
authRoutes.post('/password/reset-request', async (c) => {
  await rateLimit(c.env, `reset:${clientIp(c.req.raw)}`, 5, 3600_000);
  const { email } = await parseBody(c, z.strictObject({ email: z.email() }));
  const u = await first<{ id: string }>(
    c.env.DB,
    `SELECT id FROM users WHERE email=? AND status='active'`,
    email.trim().toLowerCase(),
  );
  if (u) {
    const token = randomToken(32);
    const now = new Date();
    await c.env.DB.batch([
      stmt(
        c.env.DB,
        'INSERT INTO password_resets(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)',
        newId('idm'),
        u.id,
        await sha256Hex(token),
        new Date(now.getTime() + 30 * 60_000).toISOString(),
        now.toISOString(),
      ),
      stmt(
        c.env.DB,
        `INSERT INTO outbound_emails(id,tenant_id,recipient_user_id,template,status,created_at) VALUES(?,NULL,?,'password_reset','pending_provider',?)`,
        newId('ntf'),
        u.id,
        now.toISOString(),
      ),
    ]);
    // O token é cifrado e entregue somente pelo provedor de e-mail (BLOCKED_EXTERNAL até configuração).
    await c.env.CONFIG_KV.put(`reset-token:${u.id}`, await encrypt(c.env.DATA_ENCRYPTION_KEY, token), {
      expirationTtl: 1800,
    });
  }
  return c.json({ data: { accepted: true } }, 202);
});

authRoutes.post('/password/reset', async (c) => {
  await rateLimit(c.env, `reset-confirm:${clientIp(c.req.raw)}`, 10, 3600_000);
  const body = await parseBody(
    c,
    z.strictObject({ token: z.string().min(20).max(200), new_password: Password }),
  );
  const r = await first<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
    c.env.DB,
    'SELECT id,user_id,expires_at,used_at FROM password_resets WHERE token_hash=?',
    await sha256Hex(body.token),
  );
  if (!r || r.used_at || new Date(r.expires_at) <= new Date())
    throw new PulseError('AUTH_REQUIRED', 'link de recuperação inválido ou expirado');
  const now = new Date().toISOString();
  const sessions = await all<{ tenant_id: string }>(
    c.env.DB,
    'SELECT DISTINCT tenant_id FROM sessions WHERE user_id=?',
    r.user_id,
  );
  await c.env.DB.batch([
    stmt(c.env.DB, 'UPDATE password_resets SET used_at=? WHERE id=?', now, r.id),
    stmt(
      c.env.DB,
      'UPDATE user_credentials SET password_hash=?, failed_attempts=0, locked_until=NULL, updated_at=? WHERE user_id=?',
      await hashPassword(body.new_password),
      now,
      r.user_id,
    ),
    stmt(c.env.DB, 'UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', now, r.user_id),
  ]);
  await c.env.CONFIG_KV.delete(`reset-token:${r.user_id}`);
  for (const s of sessions)
    await audit(c.env.DB, {
      tenantId: s.tenant_id,
      actor: `user:${r.user_id}`,
      action: 'auth.password_reset',
      resourceType: 'user',
      resourceId: r.user_id,
    });
  return c.json({ data: { reset: true } });
});

export { issueSession };
