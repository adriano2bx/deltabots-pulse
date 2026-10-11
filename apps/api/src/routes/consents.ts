import { Hono } from 'hono';
import { CreateConsentRequest, type ConsentPurpose } from '@pulse/contracts';
import { PulseError, newId } from '@pulse/core';
import type { AppEnv } from '../env';
import { audit } from '../lib/audit';
import { requireAuth, requireHuman } from '../lib/auth';
import { all, first, run } from '../lib/db';
import { parseBody, parseJsonColumn } from '../lib/http';
import { onConsentRevoked } from '../services/consent';

export const consentRoutes = new Hono<AppEnv>();
consentRoutes.use('*', requireAuth);

interface ConsentRow {
  id: string;
  purpose: ConsentPurpose;
  scope_json: string;
  policy_version: string;
  granted_at: string;
  revoked_at: string | null;
  expires_at: string | null;
}

const toDto = (r: ConsentRow) => ({
  id: r.id,
  purpose: r.purpose,
  scope: parseJsonColumn(r.scope_json, {}),
  policy_version: r.policy_version,
  granted_at: r.granted_at,
  revoked_at: r.revoked_at,
  expires_at: r.expires_at,
});

consentRoutes.get('/', async (c) => {
  const p = c.get('principal');
  const rows = await all<ConsentRow>(
    c.env.DB,
    'SELECT id,purpose,scope_json,policy_version,granted_at,revoked_at,expires_at FROM consents WHERE tenant_id=? AND user_id=? ORDER BY granted_at DESC LIMIT 200',
    p.tenantId,
    p.userId,
  );
  return c.json({ data: rows.map(toDto), next_cursor: null });
});

/** Cada finalidade é concedida separadamente; nova concessão substitui a ativa da mesma finalidade. */
consentRoutes.post('/', async (c) => {
  const p = c.get('principal');
  requireHuman(p);
  const body = await parseBody(c, CreateConsentRequest);
  const now = new Date().toISOString();
  const id = newId('cns');
  await c.env.DB.batch([
    c.env.DB.prepare(
      'UPDATE consents SET revoked_at=? WHERE tenant_id=? AND user_id=? AND purpose=? AND revoked_at IS NULL',
    ).bind(now, p.tenantId, p.userId, body.purpose),
    c.env.DB.prepare(
      'INSERT INTO consents(id,tenant_id,user_id,purpose,scope_json,granted_at,expires_at,policy_version) VALUES(?,?,?,?,?,?,?,?)',
    ).bind(
      id,
      p.tenantId,
      p.userId,
      body.purpose,
      JSON.stringify(body.scope),
      now,
      body.expires_at ?? null,
      body.policy_version,
    ),
  ]);
  await audit(c.env.DB, {
    tenantId: p.tenantId,
    actor: p,
    action: 'consent.grant',
    resourceType: 'consent',
    resourceId: id,
    metadata: { purpose: body.purpose, policy_version: body.policy_version },
  });
  const row = await first<ConsentRow>(
    c.env.DB,
    'SELECT id,purpose,scope_json,policy_version,granted_at,revoked_at,expires_at FROM consents WHERE id=?',
    id,
  );
  return c.json({ data: toDto(row as ConsentRow) }, 201);
});

consentRoutes.delete('/:id', async (c) => {
  const p = c.get('principal');
  requireHuman(p);
  const id = c.req.param('id');
  const row = await first<ConsentRow>(
    c.env.DB,
    'SELECT id,purpose,scope_json,policy_version,granted_at,revoked_at,expires_at FROM consents WHERE id=? AND tenant_id=? AND user_id=?',
    id,
    p.tenantId,
    p.userId,
  );
  if (!row) throw new PulseError('NOT_FOUND');
  if (!row.revoked_at) {
    await run(c.env.DB, 'UPDATE consents SET revoked_at=? WHERE id=?', new Date().toISOString(), id);
    await onConsentRevoked(c.env, { tenantId: p.tenantId, userId: p.userId, purpose: row.purpose });
    await audit(c.env.DB, {
      tenantId: p.tenantId,
      actor: p,
      action: 'consent.revoke',
      resourceType: 'consent',
      resourceId: id,
      metadata: { purpose: row.purpose },
    });
  }
  return c.json({ data: { revoked: true, purpose: row.purpose } });
});
