import { Hono } from 'hono';
import { UpdateMeRequest } from '@pulse/contracts';
import { PulseError } from '@pulse/core';
import type { AppEnv } from '../env';
import { audit } from '../lib/audit';
import { requireAuth, requireHuman, requireScope } from '../lib/auth';
import { all, first, run } from '../lib/db';
import { parseBody } from '../lib/http';

export const meRoutes = new Hono<AppEnv>();
meRoutes.use('*', requireAuth);

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  locale: 'pt-BR' | 'en-US';
  timezone: string;
  created_at: string;
  mfa_enabled: number;
}

async function loadUser(db: D1Database, id: string) {
  const u = await first<UserRow>(
    db,
    'SELECT u.id,u.email,u.display_name,u.locale,u.timezone,u.created_at,c.mfa_enabled FROM users u JOIN user_credentials c ON c.user_id=u.id WHERE u.id=?',
    id,
  );
  if (!u) throw new PulseError('NOT_FOUND');
  return {
    id: u.id,
    email: u.email,
    display_name: u.display_name,
    locale: u.locale,
    timezone: u.timezone,
    mfa_enabled: u.mfa_enabled === 1,
    created_at: u.created_at,
  };
}

meRoutes.get('/', async (c) => {
  const p = c.get('principal');
  requireScope(p, 'profile:read');
  const user = await loadUser(c.env.DB, p.userId);
  return c.json({ data: { ...user, tenant_id: p.tenantId, org_role: p.orgRole, session_mfa: p.mfa } });
});

meRoutes.patch('/', async (c) => {
  const p = c.get('principal');
  requireScope(p, 'profile:write');
  requireHuman(p);
  const body = await parseBody(c, UpdateMeRequest);
  const sets: string[] = [];
  const params: string[] = [];
  for (const field of ['display_name', 'locale', 'timezone'] as const) {
    const value = body[field];
    if (value !== undefined) {
      sets.push(`${field}=?`);
      params.push(value);
    }
  }
  if (sets.length > 0) {
    await run(
      c.env.DB,
      `UPDATE users SET ${sets.join(',')}, updated_at=? WHERE id=?`,
      ...params,
      new Date().toISOString(),
      p.userId,
    );
    await audit(c.env.DB, {
      tenantId: p.tenantId,
      actor: p,
      action: 'user.update',
      resourceType: 'user',
      resourceId: p.userId,
      metadata: { fields: Object.keys(body) },
    });
  }
  return c.json({ data: await loadUser(c.env.DB, p.userId) });
});

meRoutes.get('/sessions', async (c) => {
  const p = c.get('principal');
  requireHuman(p);
  const rows = await all<{
    id: string;
    device_label: string | null;
    created_at: string;
    last_seen_at: string | null;
    expires_at: string;
    kind: string;
  }>(
    c.env.DB,
    `SELECT id,device_label,created_at,last_seen_at,expires_at,kind FROM sessions
      WHERE user_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC LIMIT 100`,
    p.userId,
    new Date().toISOString(),
  );
  return c.json({ data: rows.map((r) => ({ ...r, current: r.id === p.sessionId })), next_cursor: null });
});

meRoutes.delete('/sessions/:id', async (c) => {
  const p = c.get('principal');
  requireHuman(p);
  const id = c.req.param('id');
  const r = await run(
    c.env.DB,
    'UPDATE sessions SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL',
    new Date().toISOString(),
    id,
    p.userId,
  );
  if (!r.meta.changes) throw new PulseError('NOT_FOUND');
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'session.revoke',
    resourceType: 'session',
    resourceId: id,
  });
  return c.json({ data: { revoked: true } });
});
